import { expect, test, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { computeInterfaceCID, type InterfaceDescriptor, type MethodSignature } from '../../src/services/mcp-idl';
import {
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_REQUIRED_METHODS,
  type MetaGlassesDisplayProfile,
  type MetaGlassesWidgetDescriptor,
} from '../../src/services/meta-glasses-display-profile';
import {
  compileMetaGlassesWidgetManifest,
  type MetaGlassesWidgetManifest,
} from '../../src/services/meta-glasses-widget-compiler';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
} from '../../src/services/mcp-ui-profile';
import {
  createGlassesManifestControlPlaneCoverage,
  validateGlassesManifestControlPlaneCoverage,
  type GlassesManifestCoverageEntry,
} from '../../src/services/glasses/glasses-app-control-plane';

const EVIDENCE_ROOT = path.join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
);
const REPORT_PATH = path.join(EVIDENCE_ROOT, 'glasses-handoff-report.json');
const SCREENSHOT_ROOT = path.join(EVIDENCE_ROOT, 'glasses-screenshots');
const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};
const DESCRIPTOR_SUPPORT_METHODS = [
  'subscribe_updates',
  'status_summary',
] as const;
const HANDOFF_STEPS = [
  'compile_manifest',
  'open_app',
  'focus_next',
  'focus_previous',
  'activate',
  'dispatch_result',
  'fallback',
  'clear',
  'recover_session',
] as const;

type HandoffStep = typeof HANDOFF_STEPS[number];

interface HandoffOperationResult {
  step: HandoffStep;
  status: 'passed' | 'failed';
  duration_ms: number;
  detail?: string;
  screenshot_path?: string;
  error?: string;
}

interface HandoffAppResult {
  app_id: string;
  app_title: string;
  display_source: string;
  render_path: string;
  fallback_target: string;
  focus_order: string[];
  action_count: number;
  widget_id?: string;
  widget_cid?: string;
  interface_cid?: string;
  receipt_cid?: string;
  recovered: boolean;
  operations: HandoffOperationResult[];
}

interface ReplayApp {
  app_id: string;
  app_title: string;
  display_source: string;
  render_path: string;
  fallback_target: string;
  fallback_message: string;
  focus_order: string[];
  actions: Array<{
    id: string;
    label: string;
    method: string;
    backend_action_id: string;
  }>;
  regions: Array<{
    id: string;
    kind: string;
    text: string;
    action_id?: string;
  }>;
  widget_id: string;
  widget_cid: string;
  interface_cid: string;
  receipt_cid: string;
}

test.describe('Meta glasses all app handoff replay', () => {
  test('all app handoff replays displayable SwissKnife apps without Meta hardware', async ({ page }) => {
    const coverage = createGlassesManifestControlPlaneCoverage();
    const validation = validateGlassesManifestControlPlaneCoverage(coverage);
    const displayableEntries = coverage.entries.filter(isDisplayableEntry);
    const results: HandoffAppResult[] = [];

    fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
    await page.setContent(renderReplayHarnessHtml());

    expect(validation.valid, validation.errors.join('\n')).toBe(true);
    expect(displayableEntries.length).toBeGreaterThan(0);

    for (const [index, entry] of displayableEntries.entries()) {
      const operations: HandoffOperationResult[] = [];
      const result: HandoffAppResult = {
        app_id: entry.app_id,
        app_title: entry.app_title,
        display_source: entry.display_source,
        render_path: entry.display_profile.target.render_path,
        fallback_target: entry.display_profile.fallback.render_path,
        focus_order: [...(entry.display_profile.layout.focus_order ?? [])],
        action_count: entry.display_profile.actions?.length ?? 0,
        recovered: false,
        operations,
      };
      results.push(result);

      let replayApp: ReplayApp | null = null;
      await recordStep(operations, 'compile_manifest', async () => {
        const compiled = buildReplayApp(entry);
        replayApp = compiled.replayApp;
        result.widget_id = compiled.manifest.widget_id;
        result.widget_cid = compiled.manifest.widget_cid;
        result.interface_cid = compiled.interfaceCid;
        result.receipt_cid = compiled.replayApp.receipt_cid;
      });

      if (!replayApp) continue;

      const safeAppName = sanitizeFilePart(entry.app_id);
      const openScreenshot = path.join(
        SCREENSHOT_ROOT,
        `${String(index + 1).padStart(2, '0')}-${safeAppName}-open.png`,
      );
      const fallbackScreenshot = path.join(
        SCREENSHOT_ROOT,
        `${String(index + 1).padStart(2, '0')}-${safeAppName}-fallback.png`,
      );

      await recordStep(operations, 'open_app', async () => {
        await openReplayApp(page, replayApp);
        await expect(page.getByTestId('active-app')).toContainText(entry.app_title);
        await expect(page.getByTestId('session-state')).toContainText('open');
        await expect(page.getByTestId('receipt')).toContainText(replayApp.receipt_cid);
        await glassesViewport(page).screenshot({ path: openScreenshot });
      }, openScreenshot);

      await recordStep(operations, 'focus_next', async () => {
        const expectedFocus = replayApp.focus_order.length > 1
          ? replayApp.focus_order[1]
          : replayApp.focus_order[0];
        await page.getByTestId('focus-next').click();
        await expect(page.getByTestId('focused-action')).toContainText(expectedFocus);
      });

      await recordStep(operations, 'focus_previous', async () => {
        const expectedFocus = replayApp.focus_order[0];
        await page.getByTestId('focus-previous').click();
        await expect(page.getByTestId('focused-action')).toContainText(expectedFocus);
      });

      await recordStep(operations, 'activate', async () => {
        const expectedAction = replayApp.actions.find(action => action.id === replayApp.focus_order[0])
          ?? replayApp.actions[0];
        await page.getByTestId('activate').click();
        await expect(page.getByTestId('activation')).toContainText(expectedAction.backend_action_id);
        await expect(page.getByTestId('activation')).toContainText('outcome=allow');
      });

      await recordStep(operations, 'dispatch_result', async () => {
        await dispatchReplayResult(page, {
          status: 'ok',
          cid: `sha256:hardware-free-${safeAppName}`,
          summary: `${entry.app_title} MCP++ handoff result delivered through ORB.`,
        });
        await expect(page.getByTestId('result')).toContainText('status=ok');
        await expect(page.getByTestId('result')).toContainText(`sha256:hardware-free-${safeAppName}`);
      });

      await recordStep(operations, 'fallback', async () => {
        await page.getByTestId('fallback').click();
        await expect(page.getByTestId('session-state')).toContainText('fallback');
        await expect(page.getByTestId('fallback-state')).toContainText(replayApp.fallback_target);
        await glassesViewport(page).screenshot({ path: fallbackScreenshot });
      }, fallbackScreenshot);

      await recordStep(operations, 'clear', async () => {
        await page.getByTestId('clear').click();
        await expect(page.getByTestId('active-app')).toContainText('No active app');
        await expect(page.getByTestId('session-state')).toContainText('cleared');
      });

      await recordStep(operations, 'recover_session', async () => {
        await recoverReplaySession(page, entry.app_id);
        await expect(page.getByTestId('active-app')).toContainText(entry.app_title);
        await expect(page.getByTestId('session-state')).toContainText('recovered');
        result.recovered = true;
      });
    }

    writeHandoffReport({
      schema: 'swissknife.meta-glasses-all-app-handoff-report.v1',
      generated_at: new Date().toISOString(),
      control_plane_id: coverage.control_plane_id,
      manifest_id: coverage.manifest_id,
      manifest_version: coverage.version,
      app_count: coverage.app_count,
      displayable_count: displayableEntries.length,
      passed_count: results.filter(app => app.operations.every(step => step.status === 'passed')).length,
      screenshot_root: SCREENSHOT_ROOT,
      hardware_free: true,
      dat_package_credentials_required: false,
      paired_meta_glasses_required: false,
      results,
    });

    const failures = results.flatMap(result =>
      result.operations
        .filter(operation => operation.status === 'failed')
        .map(operation => `${result.app_id}:${operation.step}:${operation.error ?? 'failed'}`),
    );
    expect(failures).toEqual([]);
    expect(results.every(result => result.recovered)).toBe(true);
  });
});

async function recordStep(
  operations: HandoffOperationResult[],
  step: HandoffStep,
  action: () => Promise<void>,
  screenshotPath?: string,
): Promise<void> {
  const started = Date.now();
  try {
    await action();
    operations.push({
      step,
      status: 'passed',
      duration_ms: Date.now() - started,
      ...(screenshotPath ? { screenshot_path: path.relative(process.cwd(), screenshotPath) } : {}),
    });
  } catch (error) {
    operations.push({
      step,
      status: 'failed',
      duration_ms: Date.now() - started,
      ...(screenshotPath ? { screenshot_path: path.relative(process.cwd(), screenshotPath) } : {}),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildReplayApp(entry: GlassesManifestCoverageEntry & { display_profile: MetaGlassesDisplayProfile }): {
  descriptor: MetaGlassesWidgetDescriptor;
  interfaceCid: string;
  manifest: MetaGlassesWidgetManifest;
  replayApp: ReplayApp;
} {
  const descriptor = buildDescriptorForEntry(entry);
  const interfaceCid = computeInterfaceCID(descriptor as InterfaceDescriptor);
  const manifest = compileMetaGlassesWidgetManifest(descriptor, {
    state: buildStateForProfile(entry),
    interface_cid: interfaceCid,
    operation: 'render_widget',
    widget_id: `swissknife.${entry.app_id}.meta-glasses-handoff`,
  });
  const replayApp = {
    app_id: entry.app_id,
    app_title: entry.app_title,
    display_source: entry.display_source,
    render_path: entry.display_profile.target.render_path,
    fallback_target: entry.display_profile.fallback.render_path,
    fallback_message: entry.display_profile.fallback.message,
    focus_order: manifest.focus_order.length ? manifest.focus_order : manifest.actions.map(action => action.id),
    actions: manifest.actions.map(action => ({
      id: action.id,
      label: action.label ?? action.id,
      method: action.method,
      backend_action_id: action.backend_action_id,
    })),
    regions: manifest.regions.map(region => ({
      id: region.id,
      kind: region.kind,
      text: region.text?.value ?? region.media_id ?? region.action_id ?? region.kind,
      action_id: region.action_id,
    })),
    widget_id: manifest.widget_id,
    widget_cid: manifest.widget_cid,
    interface_cid: interfaceCid,
    receipt_cid: `sha256:${sanitizeFilePart(entry.app_id)}-handoff-receipt`,
  };

  return { descriptor, interfaceCid, manifest, replayApp };
}

function buildDescriptorForEntry(
  entry: GlassesManifestCoverageEntry & { display_profile: MetaGlassesDisplayProfile },
): MetaGlassesWidgetDescriptor {
  const profile = entry.display_profile;
  const methodNames = unique([
    ...META_GLASSES_REQUIRED_METHODS,
    ...DESCRIPTOR_SUPPORT_METHODS,
    ...(profile.actions ?? []).map(action => action.method),
  ]);
  const stateKeys = stateKeysForProfile(entry);
  const methods: MethodSignature[] = methodNames.map(name => ({
    name,
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
  }));

  return {
    name: safeDescriptorName(entry.app_id),
    namespace: 'org.hallucinate.swissknife.meta_glasses.handoff',
    version: '1.0.0',
    methods,
    errors: [
      { name: 'DisplayUnavailable' },
      { name: 'ActionDenied' },
      { name: 'SessionNotReady' },
      { name: 'SessionRecoveryFailed' },
    ],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: [
      'swissknife',
      'virtual-desktop',
      'meta-glasses',
      'hardware-free',
      entry.app_id,
    ],
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
      app_id: entry.app_id,
      title: entry.app_title,
      description: `Hardware-free Meta glasses handoff replay for ${entry.app_title}.`,
      publisher: 'swissknife',
      icon: 'SK',
    },
    services: [
      {
        id: 'glasses-handoff-control-plane',
        interface_type: 'generic',
        transport: 'local',
        operations: methodNames,
      },
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          title: `${entry.app_title} Handoff`,
          operations: ['status_summary', 'subscribe_updates'],
          regions: [
            {
              id: 'glasses-viewport',
              kind: 'status',
              operation: 'status_summary',
            },
          ],
        },
      ],
    },
    data_contracts: {
      operations: methodNames.map(method => dataContractForMethod(method)),
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(methodNames.map(method => [method, ['display/widget']])),
    },
    state_model: {
      keys: stateKeys,
      events: [
        `swissknife.${entry.app_id}.meta_glasses.opened`,
        `swissknife.${entry.app_id}.meta_glasses.result`,
        `swissknife.${entry.app_id}.meta_glasses.recovered`,
      ],
      replay: true,
    },
    [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: profile,
  };
}

function buildStateForProfile(
  entry: GlassesManifestCoverageEntry & { display_profile: MetaGlassesDisplayProfile },
): Record<string, unknown> {
  return Object.fromEntries(stateKeysForProfile(entry).map(key => [
    key,
    stateValueForKey(key, entry),
  ]));
}

function dataContractForMethod(method: string): {
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
} {
  const contract = {
    method,
    title: titleize(method),
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
    idempotent: [
      'render_widget',
      'update_widget',
      'clear_widget',
      'focus_next',
      'focus_previous',
      'reset_session',
      'status_summary',
    ].includes(method),
  };

  if (method !== 'subscribe_updates') {
    return contract;
  }

  return {
    ...contract,
    stream: {
      kind: 'events',
      correlation_id_field: 'correlation_id',
      event_schema: OBJECT_SCHEMA,
    },
  };
}

function stateKeysForProfile(
  entry: GlassesManifestCoverageEntry & { display_profile: MetaGlassesDisplayProfile },
): string[] {
  const profile = entry.display_profile;
  const keys = new Set([
    'app_id',
    'title',
    'status',
    'focused_action',
    'last_result',
    'fallback_reason',
    'session_status',
  ]);

  for (const action of profile.actions ?? []) {
    for (const key of action.state_keys ?? []) keys.add(key);
  }
  for (const region of profile.layout.regions) {
    const sourceKey = stateSourceKey(region.text?.source);
    if (sourceKey) keys.add(sourceKey);
  }

  return [...keys];
}

function stateSourceKey(source: string | undefined): string | null {
  const prefix = 'state.';
  if (!source?.startsWith(prefix)) return null;
  return source.slice(prefix.length).split(/[.\[]/, 1)[0] || null;
}

function stateValueForKey(
  key: string,
  entry: GlassesManifestCoverageEntry & { display_profile: MetaGlassesDisplayProfile },
): string {
  const friendly = titleize(key);
  if (key === 'app_id') return entry.app_id;
  if (key === 'title') return entry.app_title;
  if (key === 'status') return `${entry.app_title} ready for hardware-free handoff`;
  if (key === 'focused_action') return entry.display_profile.layout.focus_order?.[0] ?? 'none';
  if (key === 'last_result') return 'No MCP++ result dispatched yet';
  if (key === 'fallback_reason') return 'dat_native_display_unavailable';
  if (key === 'session_status') return 'open';
  return `${friendly}: replay fixture`;
}

function isDisplayableEntry(entry: GlassesManifestCoverageEntry): entry is GlassesManifestCoverageEntry & {
  display_profile: MetaGlassesDisplayProfile;
} {
  return entry.displayable && Boolean(entry.display_profile);
}

async function openReplayApp(page: Page, app: ReplayApp): Promise<void> {
  await page.evaluate(input => {
    (window as unknown as {
      glassesReplay: { openApp: (replayApp: ReplayApp) => void };
    }).glassesReplay.openApp(input);
  }, app);
}

async function dispatchReplayResult(
  page: Page,
  result: { status: string; cid: string; summary: string },
): Promise<void> {
  await page.evaluate(input => {
    (window as unknown as {
      glassesReplay: {
        dispatchResult: (replayResult: { status: string; cid: string; summary: string }) => void;
      };
    }).glassesReplay.dispatchResult(input);
  }, result);
}

async function recoverReplaySession(page: Page, appId: string): Promise<void> {
  await page.evaluate(input => {
    (window as unknown as {
      glassesReplay: { recoverSession: (replayAppId: string) => void };
    }).glassesReplay.recoverSession(input);
  }, appId);
}

function glassesViewport(page: Page): Locator {
  return page.getByTestId('glasses-viewport');
}

function writeHandoffReport(report: Record<string, unknown>): void {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function sanitizeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function safeDescriptorName(value: string): string {
  return `swissknife-${sanitizeFilePart(value)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function titleize(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function renderReplayHarnessHtml(): string {
  return String.raw`
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>SwissKnife Meta Glasses Handoff Replay</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #101412;
        color: #f3f6f2;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          linear-gradient(135deg, rgba(29, 41, 36, 0.92), rgba(16, 20, 18, 0.98)),
          #101412;
      }

      main {
        width: min(100vw, 980px);
        display: grid;
        grid-template-columns: 600px minmax(260px, 1fr);
        gap: 20px;
        padding: 24px;
      }

      .viewport {
        width: 600px;
        height: 600px;
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(204, 228, 199, 0.24);
        background: #050706;
        border-radius: 8px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
      }

      .viewport-header {
        position: absolute;
        inset: 0 0 auto 0;
        min-height: 104px;
        padding: 24px;
        background: linear-gradient(180deg, rgba(25, 38, 32, 0.96), rgba(15, 20, 17, 0));
      }

      .app-title {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        line-height: 1.2;
        color: #f7fbf6;
      }

      .app-meta {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
        color: #c5d8c3;
      }

      .pill {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border: 1px solid rgba(197, 216, 195, 0.2);
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(197, 216, 195, 0.08);
      }

      .regions {
        position: absolute;
        inset: 126px 24px 122px;
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .region {
        min-height: 36px;
        max-height: 76px;
        overflow: hidden;
        border: 1px solid rgba(166, 205, 158, 0.16);
        border-radius: 6px;
        padding: 9px 10px;
        background: rgba(255, 255, 255, 0.045);
        color: #e7efe5;
        font-size: 15px;
        line-height: 1.3;
      }

      .actions {
        position: absolute;
        left: 24px;
        right: 24px;
        bottom: 24px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .action {
        height: 68px;
        border: 1px solid rgba(195, 226, 188, 0.22);
        border-radius: 6px;
        display: grid;
        place-items: center;
        text-align: center;
        padding: 8px;
        background: rgba(198, 225, 192, 0.08);
        color: #eff9ed;
        font-size: 15px;
        font-weight: 650;
        line-height: 1.15;
      }

      .action.focused {
        border-color: #b7ee92;
        background: rgba(183, 238, 146, 0.19);
        color: #fbfff8;
        box-shadow: inset 0 0 0 1px rgba(183, 238, 146, 0.25);
      }

      .side {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .controls {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      button {
        min-height: 40px;
        border: 1px solid rgba(197, 216, 195, 0.22);
        border-radius: 6px;
        background: #1d2a23;
        color: #f3f6f2;
        font: inherit;
        font-size: 14px;
      }

      .telemetry {
        min-height: 40px;
        border: 1px solid rgba(197, 216, 195, 0.16);
        border-radius: 6px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.04);
        color: #dce8d9;
        font-size: 13px;
        line-height: 1.35;
        word-break: break-word;
      }

      @media (max-width: 900px) {
        main {
          grid-template-columns: 1fr;
          padding: 12px;
        }

        .viewport {
          width: min(600px, calc(100vw - 24px));
          height: min(600px, calc(100vw - 24px));
          aspect-ratio: 1 / 1;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="viewport" data-testid="glasses-viewport" aria-label="Meta glasses viewport">
        <div class="viewport-header">
          <h1 class="app-title" data-testid="active-app">No active app</h1>
          <div class="app-meta">
            <span class="pill" data-testid="session-state">idle</span>
            <span class="pill" data-testid="focused-action">focus=none</span>
            <span class="pill" data-testid="receipt">receipt=none</span>
          </div>
        </div>
        <div class="regions" data-testid="regions"></div>
        <div class="actions" data-testid="actions"></div>
      </section>
      <aside class="side">
        <div class="controls">
          <button type="button" data-testid="focus-previous">Previous</button>
          <button type="button" data-testid="focus-next">Next</button>
          <button type="button" data-testid="activate">Activate</button>
          <button type="button" data-testid="fallback">Fallback</button>
          <button type="button" data-testid="clear">Clear</button>
        </div>
        <div class="telemetry" data-testid="activation">activation=none</div>
        <div class="telemetry" data-testid="result">result=none</div>
        <div class="telemetry" data-testid="fallback-state">fallback=none</div>
      </aside>
    </main>
    <script>
      (() => {
        const state = {
          active: null,
          focusIndex: 0,
          sessions: new Map(),
          activation: 'activation=none',
          result: 'result=none',
          fallback: 'fallback=none',
          sessionState: 'idle'
        };

        const byTestId = id => document.querySelector('[data-testid="' + id + '"]');

        function openApp(app) {
          state.active = app;
          state.focusIndex = 0;
          state.sessionState = 'open';
          state.activation = 'activation=none';
          state.result = 'result=none';
          state.fallback = 'fallback=none';
          state.sessions.set(app.app_id, {
            app,
            focusIndex: state.focusIndex,
            result: state.result,
            activation: state.activation,
            fallback: state.fallback
          });
          render();
        }

        function focusNext() {
          if (!state.active) return;
          const size = Math.max(1, state.active.focus_order.length);
          state.focusIndex = (state.focusIndex + 1) % size;
          remember();
          render();
        }

        function focusPrevious() {
          if (!state.active) return;
          const size = Math.max(1, state.active.focus_order.length);
          state.focusIndex = (state.focusIndex + size - 1) % size;
          remember();
          render();
        }

        function activate() {
          if (!state.active) return;
          const focusId = focusedId();
          const action = state.active.actions.find(item => item.id === focusId) || state.active.actions[0];
          if (!action) {
            state.activation = 'activation=no_action outcome=allow';
          } else {
            state.activation = [
              'activation=' + action.id,
              'method=' + action.method,
              'backend=' + action.backend_action_id,
              'outcome=allow',
              'widget=' + state.active.widget_cid
            ].join(' ');
          }
          remember();
          render();
        }

        function dispatchResult(result) {
          if (!state.active) return;
          state.result = [
            'status=' + result.status,
            'cid=' + result.cid,
            'summary=' + result.summary
          ].join(' ');
          remember();
          render();
        }

        function fallback() {
          if (!state.active) return;
          state.sessionState = 'fallback';
          state.fallback = [
            'fallback=' + state.active.fallback_target,
            'reason=dat_native_display_unavailable',
            'message=' + state.active.fallback_message
          ].join(' ');
          remember();
          render();
        }

        function clearActive() {
          state.active = null;
          state.focusIndex = 0;
          state.sessionState = 'cleared';
          render();
        }

        function recoverSession(appId) {
          const session = state.sessions.get(appId);
          if (!session) {
            state.sessionState = 'recovery_failed';
            render();
            return;
          }
          state.active = session.app;
          state.focusIndex = session.focusIndex;
          state.result = session.result;
          state.activation = session.activation;
          state.fallback = session.fallback;
          state.sessionState = 'recovered';
          render();
        }

        function remember() {
          if (!state.active) return;
          state.sessions.set(state.active.app_id, {
            app: state.active,
            focusIndex: state.focusIndex,
            result: state.result,
            activation: state.activation,
            fallback: state.fallback
          });
        }

        function focusedId() {
          if (!state.active) return 'none';
          return state.active.focus_order[state.focusIndex] || state.active.actions[0]?.id || 'none';
        }

        function render() {
          byTestId('session-state').textContent = state.sessionState;
          byTestId('activation').textContent = state.activation;
          byTestId('result').textContent = state.result;
          byTestId('fallback-state').textContent = state.fallback;

          if (!state.active) {
            byTestId('active-app').textContent = 'No active app';
            byTestId('focused-action').textContent = 'focus=none';
            byTestId('receipt').textContent = 'receipt=none';
            byTestId('regions').innerHTML = '';
            byTestId('actions').innerHTML = '';
            return;
          }

          byTestId('active-app').textContent = state.active.app_title;
          byTestId('focused-action').textContent = 'focus=' + focusedId();
          byTestId('receipt').textContent = 'receipt=' + state.active.receipt_cid;
          renderRegions();
          renderActions();
        }

        function renderRegions() {
          const root = byTestId('regions');
          root.innerHTML = '';
          for (const region of state.active.regions.slice(0, 5)) {
            const item = document.createElement('div');
            item.className = 'region';
            item.textContent = region.kind + ':' + region.id + ' ' + region.text;
            root.appendChild(item);
          }
        }

        function renderActions() {
          const root = byTestId('actions');
          root.innerHTML = '';
          const focused = focusedId();
          for (const action of state.active.actions.slice(0, 3)) {
            const item = document.createElement('div');
            item.className = action.id === focused ? 'action focused' : 'action';
            item.textContent = action.label || action.id;
            root.appendChild(item);
          }
        }

        byTestId('focus-next').addEventListener('click', focusNext);
        byTestId('focus-previous').addEventListener('click', focusPrevious);
        byTestId('activate').addEventListener('click', activate);
        byTestId('fallback').addEventListener('click', fallback);
        byTestId('clear').addEventListener('click', clearActive);

        window.glassesReplay = {
          openApp,
          dispatchResult,
          recoverSession
        };
      })();
    </script>
  </body>
</html>`;
}
