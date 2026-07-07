import { URL } from 'url';
import {
  META_GLASSES_DISPLAY_VIEWPORT,
  type MetaGlassesViewport,
} from './meta-glasses-display-profile.js';
import type {
  MetaGlassesCompiledAction,
  MetaGlassesCompiledRegion,
  MetaGlassesJSONValue,
  MetaGlassesWidgetManifest,
} from './meta-glasses-widget-compiler.js';

export const META_GLASSES_WEBAPP_RENDERER_SCHEMA =
  'handsfree.meta-glasses/webapp-preview';
export const META_GLASSES_WEBAPP_RENDERER_SCHEMA_VERSION = '0.1.0';

export const META_GLASSES_WEBAPP_READINESS_CHECK_IDS = [
  'https_public_url',
  'viewport_600x600',
  'dpad_focus_navigation',
  'dark_theme_support',
  'contrast_ratio',
  'app_connection_onboarding',
] as const;

export type MetaGlassesWebappReadinessCheckId =
  (typeof META_GLASSES_WEBAPP_READINESS_CHECK_IDS)[number];

export interface MetaGlassesWebappTheme {
  background: string;
  surface: string;
  surface_muted: string;
  text: string;
  muted_text: string;
  accent: string;
  focus: string;
  border: string;
  danger: string;
}

export interface MetaGlassesWebappRendererOptions {
  deployment_url?: string;
  title?: string;
  app_connection_documented?: boolean;
  include_manifest_json?: boolean;
  theme?: Partial<MetaGlassesWebappTheme>;
  nonce?: string;
}

export interface MetaGlassesWebappReadinessDescriptor {
  deployment_url: string;
  viewport: MetaGlassesViewport;
  navigation_model: 'dpad_focus';
  focusable_elements: number;
  navigation_order_valid: boolean;
  dark_theme_supported: boolean;
  min_contrast_ratio: number;
  app_connection_documented: boolean;
  widgets: MetaGlassesWebappWidgetReadinessDescriptor[];
}

export interface MetaGlassesWebappWidgetReadinessDescriptor {
  widget_id: string;
  widget_cid: string;
  render_path: string;
  fallback_render_path: string;
  webapp_target: boolean;
  deployment_url: string;
  viewport: MetaGlassesViewport;
  navigation_model: 'dpad_focus';
  focusable_elements: number;
  focus_order: string[];
  navigation_order_valid: boolean;
  dark_theme_supported: boolean;
  min_contrast_ratio: number;
  browser_preview: {
    renderer: string;
    renderable: boolean;
    viewport: MetaGlassesViewport;
  };
}

export interface MetaGlassesWebappReadinessCheck {
  id: string;
  status: 'pass' | 'fail';
  message: string;
  severity: 'info' | 'error';
}

export interface MetaGlassesWebappReadinessResult {
  ready: boolean;
  checks: MetaGlassesWebappReadinessCheck[];
  failure_ids: string[];
  summary: 'display_webapp_ready' | 'display_webapp_not_ready';
}

export interface MetaGlassesWebappPreview {
  schema: typeof META_GLASSES_WEBAPP_RENDERER_SCHEMA;
  schema_version: typeof META_GLASSES_WEBAPP_RENDERER_SCHEMA_VERSION;
  widget_id: string;
  widget_cid: string;
  viewport: MetaGlassesViewport;
  html: string;
  readiness: MetaGlassesWebappReadinessDescriptor;
  readiness_result: MetaGlassesWebappReadinessResult;
}

const DEFAULT_THEME: MetaGlassesWebappTheme = {
  background: '#05070d',
  surface: '#111827',
  surface_muted: '#1f2937',
  text: '#f8fafc',
  muted_text: '#cbd5e1',
  accent: '#22c55e',
  focus: '#38bdf8',
  border: '#64748b',
  danger: '#f87171',
};

export function renderMetaGlassesWebappPreview(
  manifest: MetaGlassesWidgetManifest,
  options: MetaGlassesWebappRendererOptions = {},
): MetaGlassesWebappPreview {
  const theme = normalizeTheme(options.theme);
  const readiness = buildMetaGlassesWebappReadinessDescriptor(manifest, {
    ...options,
    theme,
  });
  const readinessResult = evaluateMetaGlassesWebappReadiness(readiness);

  return {
    schema: META_GLASSES_WEBAPP_RENDERER_SCHEMA,
    schema_version: META_GLASSES_WEBAPP_RENDERER_SCHEMA_VERSION,
    widget_id: manifest.widget_id,
    widget_cid: manifest.widget_cid,
    viewport: { ...manifest.viewport },
    html: renderPreviewHtml(manifest, theme, options),
    readiness,
    readiness_result: readinessResult,
  };
}

export function buildMetaGlassesWebappReadinessDescriptor(
  manifest: MetaGlassesWidgetManifest,
  options: MetaGlassesWebappRendererOptions = {},
): MetaGlassesWebappReadinessDescriptor {
  const theme = normalizeTheme(options.theme);
  const focusableActions = orderedFocusableActions(manifest);
  const deploymentUrl = options.deployment_url ?? defaultDeploymentUrl(manifest);
  const navigationOrderValid = hasValidFocusOrder(manifest, focusableActions);
  const contrastRatio = minContrastRatio(theme);

  const widget: MetaGlassesWebappWidgetReadinessDescriptor = {
    widget_id: manifest.widget_id,
    widget_cid: manifest.widget_cid,
    render_path: manifest.renderer_hints.primary_render_path,
    fallback_render_path: manifest.fallback.render_path,
    webapp_target: isMetaGlassesWebappTarget(manifest),
    deployment_url: deploymentUrl,
    viewport: { ...manifest.viewport },
    navigation_model: 'dpad_focus',
    focusable_elements: focusableActions.length,
    focus_order: focusableActions.map(action => action.id),
    navigation_order_valid: navigationOrderValid,
    dark_theme_supported: true,
    min_contrast_ratio: contrastRatio,
    browser_preview: {
      renderer: 'swissknife/src/services/meta-glasses-webapp-renderer.ts',
      renderable: canRenderBrowserPreview(manifest),
      viewport: { ...manifest.viewport },
    },
  };

  return {
    deployment_url: deploymentUrl,
    viewport: { ...manifest.viewport },
    navigation_model: 'dpad_focus',
    focusable_elements: focusableActions.length,
    navigation_order_valid: navigationOrderValid,
    dark_theme_supported: true,
    min_contrast_ratio: contrastRatio,
    app_connection_documented: options.app_connection_documented ?? true,
    widgets: [widget],
  };
}

export function evaluateMetaGlassesWebappReadiness(
  readiness: MetaGlassesWebappReadinessDescriptor,
): MetaGlassesWebappReadinessResult {
  const urlOk = isPublicHttpsUrl(readiness.deployment_url);
  const viewportOk = isFixedViewport(readiness.viewport);
  const navigationOk = readiness.navigation_model === 'dpad_focus'
    && Number.isInteger(readiness.focusable_elements)
    && readiness.focusable_elements > 0
    && readiness.navigation_order_valid === true;
  const darkThemeOk = readiness.dark_theme_supported === true;
  const contrastOk = Number.isFinite(readiness.min_contrast_ratio)
    && readiness.min_contrast_ratio >= 4.5;
  const onboardingOk = readiness.app_connection_documented === true;

  const checks: MetaGlassesWebappReadinessCheck[] = [
    buildReadinessCheck(
      'https_public_url',
      urlOk,
      'Deployment URL is HTTPS and publicly reachable.',
      'Deployment URL must be HTTPS and publicly reachable.',
    ),
    buildReadinessCheck(
      'viewport_600x600',
      viewportOk,
      'Viewport is configured for 600x600 rendering.',
      'Viewport must be exactly 600x600 for display-glasses web apps.',
    ),
    buildReadinessCheck(
      'dpad_focus_navigation',
      navigationOk,
      'D-pad focus navigation is configured with a valid focus order.',
      'Navigation must use dpad_focus with focusable elements and validated order.',
    ),
    buildReadinessCheck(
      'dark_theme_support',
      darkThemeOk,
      'Dark theme support is enabled.',
      'Dark theme support is required for display readability.',
    ),
    buildReadinessCheck(
      'contrast_ratio',
      contrastOk,
      'Minimum contrast ratio meets or exceeds 4.5.',
      'Minimum contrast ratio must be >= 4.5.',
    ),
    buildReadinessCheck(
      'app_connection_onboarding',
      onboardingOk,
      'App-connection onboarding is documented.',
      'Document app-connection onboarding for hosted web-app deployment.',
    ),
  ];
  checks.push(...buildWidgetReadinessChecks(readiness));

  const failureIds = checks
    .filter(check => check.status === 'fail')
    .map(check => check.id);

  return {
    ready: failureIds.length === 0,
    checks,
    failure_ids: failureIds,
    summary: failureIds.length === 0
      ? 'display_webapp_ready'
      : 'display_webapp_not_ready',
  };
}

export function assertMetaGlassesWebappReady(
  manifest: MetaGlassesWidgetManifest,
  options: MetaGlassesWebappRendererOptions = {},
): void {
  const readiness = buildMetaGlassesWebappReadinessDescriptor(manifest, options);
  const result = evaluateMetaGlassesWebappReadiness(readiness);
  if (!result.ready) {
    throw new Error(
      `Meta glasses webapp readiness failed: ${result.failure_ids.join(', ')}`,
    );
  }
}

export function isMetaGlassesWebappTarget(
  manifest: MetaGlassesWidgetManifest,
): boolean {
  return manifest.renderer_hints.primary_render_path === 'display-webapp'
    || manifest.renderer_hints.display_webapp.fallback_allowed
    || manifest.fallback.render_path === 'display-webapp';
}

function renderPreviewHtml(
  manifest: MetaGlassesWidgetManifest,
  theme: MetaGlassesWebappTheme,
  options: MetaGlassesWebappRendererOptions,
): string {
  const title = escapeHtml(
    options.title
      ?? manifest.descriptor.name
      ?? 'Meta glasses display widget preview',
  );
  const regions = manifest.regions
    .map(region => renderRegion(region, manifest))
    .join('\n');
  const manifestJson = options.include_manifest_json === false
    ? ''
    : `\n<script type="application/json" id="mgw-manifest">${escapeScriptJson(manifest)}</script>`;
  const nonceAttribute = options.nonce ? ` nonce="${escapeAttribute(options.nonce)}"` : '';

  return `<!doctype html>
<html lang="en" data-meta-glasses-webapp="true">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=600,height=600,initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --mgw-background: ${theme.background};
      --mgw-surface: ${theme.surface};
      --mgw-surface-muted: ${theme.surface_muted};
      --mgw-text: ${theme.text};
      --mgw-muted-text: ${theme.muted_text};
      --mgw-accent: ${theme.accent};
      --mgw-focus: ${theme.focus};
      --mgw-border: ${theme.border};
      --mgw-danger: ${theme.danger};
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-width: 600px;
      min-height: 600px;
      background: var(--mgw-background);
      color: var(--mgw-text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: grid;
      place-items: center;
    }
    .mgw-viewport {
      position: relative;
      width: 600px;
      height: 600px;
      overflow: hidden;
      background: var(--mgw-background);
      color: var(--mgw-text);
      border: 1px solid var(--mgw-border);
    }
    .mgw-region {
      position: absolute;
      overflow: hidden;
      border-radius: 8px;
    }
    .mgw-text-region,
    .mgw-progress-region,
    .mgw-media-region {
      padding: 14px 16px;
      background: var(--mgw-surface);
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    .mgw-text {
      margin: 0;
      color: var(--mgw-text);
      line-height: 1.35;
      white-space: normal;
      overflow-wrap: break-word;
    }
    .mgw-text-truncate {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: var(--mgw-max-lines, 1);
    }
    .mgw-text-clip {
      text-overflow: clip;
    }
    .mgw-progress-track {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 18px;
      height: 16px;
      overflow: hidden;
      border-radius: 8px;
      background: var(--mgw-surface-muted);
      border: 1px solid rgba(203, 213, 225, 0.35);
    }
    .mgw-progress-fill {
      width: var(--mgw-progress, 0%);
      height: 100%;
      background: var(--mgw-accent);
    }
    .mgw-action {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--mgw-border);
      background: var(--mgw-surface-muted);
      color: var(--mgw-text);
      font: inherit;
      font-weight: 700;
      text-align: center;
    }
    .mgw-action:focus,
    .mgw-action:focus-visible {
      outline: 4px solid var(--mgw-focus);
      outline-offset: -4px;
      border-color: var(--mgw-focus);
    }
    .mgw-media-fallback {
      color: var(--mgw-muted-text);
    }
  </style>
</head>
<body>
  <main class="mgw-viewport" role="application" aria-label="${title}" data-widget-id="${escapeAttribute(manifest.widget_id)}" data-widget-cid="${escapeAttribute(manifest.widget_cid)}">
${regions}
  </main>${manifestJson}
  <script${nonceAttribute}>
    (function () {
      var focusables = Array.prototype.slice.call(document.querySelectorAll('[data-mgw-focus-index]'));
      focusables.sort(function (a, b) {
        return Number(a.getAttribute('data-mgw-focus-index')) - Number(b.getAttribute('data-mgw-focus-index'));
      });
      function moveFocus(delta) {
        if (focusables.length === 0) return;
        var activeIndex = focusables.indexOf(document.activeElement);
        var nextIndex = activeIndex < 0 ? 0 : (activeIndex + delta + focusables.length) % focusables.length;
        focusables[nextIndex].focus();
      }
      document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
        } else if ((event.key === 'Enter' || event.key === ' ') && document.activeElement) {
          var actionId = document.activeElement.getAttribute('data-action-id');
          if (actionId) {
            document.dispatchEvent(new CustomEvent('meta-glasses-widget-action', { detail: { action_id: actionId } }));
          }
        }
      });
      if (focusables.length > 0) focusables[0].focus();
    }());
  </script>
</body>
</html>`;
}

function renderRegion(
  region: MetaGlassesCompiledRegion,
  manifest: MetaGlassesWidgetManifest,
): string {
  const style = regionStyle(region);
  if (region.action_id) {
    return renderActionRegion(region, manifest, style);
  }
  if (region.media_id) {
    return renderMediaRegion(region, manifest, style);
  }
  if (region.kind === 'progress') {
    return renderProgressRegion(region, manifest, style);
  }
  return renderTextRegion(region, style);
}

function renderActionRegion(
  region: MetaGlassesCompiledRegion,
  manifest: MetaGlassesWidgetManifest,
  style: string,
): string {
  const action = manifest.actions.find(entry => entry.id === region.action_id);
  const label = action?.label ?? action?.id ?? region.action_id ?? 'Action';
  const focusIndex = action?.focus_index ?? manifest.focus_order.indexOf(action?.id ?? '');
  const focusAttribute = focusIndex >= 0
    ? ` data-mgw-focus-index="${focusIndex}"`
    : '';
  return `    <button class="mgw-region mgw-action" type="button" style="${style}" data-action-id="${escapeAttribute(region.action_id ?? '')}"${focusAttribute}>${escapeHtml(label)}</button>`;
}

function renderMediaRegion(
  region: MetaGlassesCompiledRegion,
  manifest: MetaGlassesWidgetManifest,
  style: string,
): string {
  const media = manifest.media.find(entry => entry.id === region.media_id);
  const fallback = media?.fallback_text ?? 'Media preview unavailable';
  return `    <section class="mgw-region mgw-media-region" style="${style}" aria-label="${escapeAttribute(fallback)}">
      <p class="mgw-text mgw-media-fallback">${escapeHtml(fallback)}</p>
    </section>`;
}

function renderProgressRegion(
  region: MetaGlassesCompiledRegion,
  manifest: MetaGlassesWidgetManifest,
  style: string,
): string {
  const progress = progressPercent(manifest.state.values);
  const text = region.text?.value ?? `${Math.round(progress)}%`;
  return `    <section class="mgw-region mgw-progress-region" style="${style}" aria-label="${escapeAttribute(text)}">
      <p class="mgw-text ${textOverflowClass(region)}" style="${lineClampStyle(region)}">${escapeHtml(text)}</p>
      <div class="mgw-progress-track" aria-hidden="true"><div class="mgw-progress-fill" style="--mgw-progress: ${progress}%"></div></div>
    </section>`;
}

function renderTextRegion(
  region: MetaGlassesCompiledRegion,
  style: string,
): string {
  const text = region.text?.value ?? '';
  return `    <section class="mgw-region mgw-text-region" style="${style}">
      <p class="mgw-text ${textOverflowClass(region)}" style="${lineClampStyle(region)}">${escapeHtml(text)}</p>
    </section>`;
}

function orderedFocusableActions(
  manifest: MetaGlassesWidgetManifest,
): MetaGlassesCompiledAction[] {
  return manifest.actions
    .filter(action => action.focusable)
    .slice()
    .sort((first, second) => {
      const firstIndex = first.focus_index ?? Number.MAX_SAFE_INTEGER;
      const secondIndex = second.focus_index ?? Number.MAX_SAFE_INTEGER;
      return firstIndex - secondIndex || first.id.localeCompare(second.id);
    });
}

function hasValidFocusOrder(
  manifest: MetaGlassesWidgetManifest,
  focusableActions: MetaGlassesCompiledAction[],
): boolean {
  if (focusableActions.length === 0) {
    return false;
  }
  const focusableIds = new Set(focusableActions.map(action => action.id));
  const focusOrderIds = new Set(manifest.focus_order);
  if (focusOrderIds.size !== manifest.focus_order.length) {
    return false;
  }
  for (const actionId of focusableIds) {
    if (!focusOrderIds.has(actionId)) {
      return false;
    }
  }
  for (const actionId of manifest.focus_order) {
    if (!focusableIds.has(actionId)) {
      return false;
    }
  }
  return true;
}

function canRenderBrowserPreview(manifest: MetaGlassesWidgetManifest): boolean {
  return isFixedViewport(manifest.viewport)
    && manifest.regions.length > 0
    && hasValidFocusOrder(manifest, orderedFocusableActions(manifest));
}

function normalizeTheme(
  overrides: Partial<MetaGlassesWebappTheme> | undefined,
): MetaGlassesWebappTheme {
  return {
    ...DEFAULT_THEME,
    ...(overrides ?? {}),
  };
}

function isFixedViewport(viewport: MetaGlassesViewport): boolean {
  return viewport.width === META_GLASSES_DISPLAY_VIEWPORT.width
    && viewport.height === META_GLASSES_DISPLAY_VIEWPORT.height;
}

function defaultDeploymentUrl(manifest: MetaGlassesWidgetManifest): string {
  return `https://example.com/glasses-display/widgets/${encodeURIComponent(manifest.widget_id)}`;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname.length === 0) {
      return false;
    }
    return parsed.hostname !== 'localhost'
      && parsed.hostname !== '127.0.0.1'
      && !parsed.hostname.startsWith('10.')
      && !parsed.hostname.startsWith('192.168.')
      && !/^172\.(1[6-9]|2\d|3[0-1])\./.test(parsed.hostname);
  } catch {
    return false;
  }
}

function minContrastRatio(theme: MetaGlassesWebappTheme): number {
  return Math.min(
    contrastRatio(theme.text, theme.background),
    contrastRatio(theme.text, theme.surface),
    contrastRatio(theme.muted_text, theme.background),
  );
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(hexToRgb(first));
  const secondLuminance = relativeLuminance(hexToRgb(second));
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return roundContrast((lighter + 0.05) / (darker + 0.05));
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [red, green, blue] = rgb.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.trim().replace(/^#/, '');
  const hex = normalized.length === 3
    ? normalized.split('').map(character => `${character}${character}`).join('')
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [0, 0, 0];
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function roundContrast(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildReadinessCheck(
  id: string,
  passed: boolean,
  successMessage: string,
  failureMessage: string,
): MetaGlassesWebappReadinessCheck {
  return {
    id,
    status: passed ? 'pass' : 'fail',
    message: passed ? successMessage : failureMessage,
    severity: passed ? 'info' : 'error',
  };
}

function buildWidgetReadinessChecks(
  readiness: MetaGlassesWebappReadinessDescriptor,
): MetaGlassesWebappReadinessCheck[] {
  return readiness.widgets
    .filter(widget => widget.webapp_target)
    .flatMap(widget => {
      const prefix = `widget_${safeCheckId(widget.widget_id)}`;
      const urlOk = isPublicHttpsUrl(widget.deployment_url || readiness.deployment_url);
      const viewportOk = isFixedViewport(widget.viewport);
      const previewOk = widget.browser_preview.renderable
        && isFixedViewport(widget.browser_preview.viewport);
      const navigationOk = widget.navigation_model === 'dpad_focus'
        && Number.isInteger(widget.focusable_elements)
        && widget.focusable_elements > 0
        && widget.navigation_order_valid === true
        && widget.focus_order.length === new Set(widget.focus_order).size;
      const darkThemeOk = widget.dark_theme_supported === true;
      const contrastOk = Number.isFinite(widget.min_contrast_ratio)
        && widget.min_contrast_ratio >= 4.5;

      return [
        buildReadinessCheck(
          `${prefix}_https_public_url`,
          urlOk,
          `${widget.widget_id} uses an HTTPS public deployment URL.`,
          `${widget.widget_id} must use an HTTPS public deployment URL.`,
        ),
        buildReadinessCheck(
          `${prefix}_browser_preview`,
          previewOk,
          `${widget.widget_id} has a renderable 600x600 browser preview.`,
          `${widget.widget_id} must have a renderable 600x600 browser preview.`,
        ),
        buildReadinessCheck(
          `${prefix}_viewport_600x600`,
          viewportOk,
          `${widget.widget_id} targets the 600x600 display viewport.`,
          `${widget.widget_id} must target the 600x600 display viewport.`,
        ),
        buildReadinessCheck(
          `${prefix}_dpad_focus_navigation`,
          navigationOk,
          `${widget.widget_id} has D-pad focus navigation and a valid focus order.`,
          `${widget.widget_id} must use D-pad focus navigation with a valid focus order.`,
        ),
        buildReadinessCheck(
          `${prefix}_dark_theme_support`,
          darkThemeOk,
          `${widget.widget_id} supports a dark display theme.`,
          `${widget.widget_id} must support a dark display theme.`,
        ),
        buildReadinessCheck(
          `${prefix}_contrast_ratio`,
          contrastOk,
          `${widget.widget_id} meets the display contrast floor.`,
          `${widget.widget_id} must meet contrast ratio >= 4.5.`,
        ),
      ];
    });
}

function safeCheckId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
  return normalized || 'unnamed_widget';
}

function progressPercent(state: Record<string, MetaGlassesJSONValue>): number {
  const candidate = state.progress ?? state.percent ?? state.completion;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return 0;
  }
  const normalized = candidate <= 1 ? candidate * 100 : candidate;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function regionStyle(region: MetaGlassesCompiledRegion): string {
  const { bounds } = region;
  return [
    `left: ${bounds.x}px`,
    `top: ${bounds.y}px`,
    `width: ${bounds.width}px`,
    `height: ${bounds.height}px`,
  ].join('; ');
}

function textOverflowClass(region: MetaGlassesCompiledRegion): string {
  return `mgw-text-${region.text?.overflow ?? 'clip'}`;
}

function lineClampStyle(region: MetaGlassesCompiledRegion): string {
  return `--mgw-max-lines: ${region.text?.max_lines ?? 1}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}
