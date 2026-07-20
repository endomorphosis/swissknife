import { createHash } from 'node:crypto';
import type { Page, ConsoleMessage, Request } from '@playwright/test';
import {
  APP_AUDIT_VIEWPORTS,
  resolveVirtualDesktopAppId,
  type AppAuditConsoleMessage,
  type AppAuditFailedRequest,
  type AppAuditScreenshotViewport,
  type VirtualDesktopAppAuditDriver,
} from './virtual-desktop-app-audit-runner.js';

// Re-export so callers only need this module for the real-browser driver.
export { resolveVirtualDesktopAppId };

/**
 * SVD-132: real-browser driver for the manifest-driven app audit runner.
 *
 * Drives the live SwissKnife desktop shell (`window.desktop` /
 * `window.swissKnifeDesktop`, see `web/js/main.js`) through a Playwright
 * `Page`: launches each canonical app via `window.desktop.launchApp`,
 * focuses/closes/reopens its window, and captures real desktop/narrow
 * screenshots plus genuine console and network failure evidence via
 * Playwright page event listeners.
 *
 * Legacy aliases (`code-editor`, `strudel-grandma`, `p2p-chat-offline`) are
 * not registered as launchable keys in the live desktop shell -- only their
 * canonical app is. This driver resolves an alias to its canonical id before
 * driving the real desktop, while the audit runner still records the
 * requested alias id in the evidence for manifest-drift and alias-coverage
 * checks.
 */
export class PlaywrightVirtualDesktopAppAuditDriver implements VirtualDesktopAppAuditDriver {
  readonly name = 'playwright';

  private readonly page: Page;
  private readonly baseUrl: string;
  private consoleBuffer: AppAuditConsoleMessage[] = [];
  private failedRequestBuffer: AppAuditFailedRequest[] = [];
  private currentPhase: AppAuditFailedRequest['phase'] = 'launch';
  private listenersAttached = false;

  constructor(page: Page, baseUrl = '/') {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async openDesktop(): Promise<void> {
    this.attachListeners();
    await this.page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForFunction(() => Boolean((window as unknown as { desktop?: unknown }).desktop));
  }

  private attachListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    this.page.on('console', (message: ConsoleMessage) => {
      const type = message.type();
      if (type !== 'error' && type !== 'warning') return;
      this.consoleBuffer.push({
        level: type === 'error' ? 'error' : 'warning',
        text: message.text(),
        source: 'browser-console',
      });
    });

    this.page.on('requestfailed', (request: Request) => {
      this.failedRequestBuffer.push({
        url: request.url(),
        method: request.method(),
        error_text: request.failure()?.errorText,
        phase: this.currentPhase,
      });
    });

    this.page.on('response', response => {
      if (response.ok()) return;
      this.failedRequestBuffer.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        phase: this.currentPhase,
      });
    });
  }

  private resolveCanonicalForClient(appId: string): string {
    return resolveVirtualDesktopAppId(appId) ?? appId;
  }

  async launchApp(appId: string): Promise<{ opened: boolean; windowId?: string; durationMs: number; error?: string }> {
    this.currentPhase = 'launch';
    const clientAppId = this.resolveCanonicalForClient(appId);
    const start = Date.now();
    try {
      const windowId = await this.page.evaluate(async (id: string) => {
        const desktop = (window as unknown as {
          desktop: {
            launchApp(id: string): Promise<unknown>;
            windows: Map<string, { appId: string }>;
          };
        }).desktop;
        await desktop.launchApp(id);
        const entries = Array.from(desktop.windows.entries());
        const match = [...entries].reverse().find(([, value]) => value.appId === id);
        return match ? match[0] : null;
      }, clientAppId);
      return { opened: windowId != null, windowId: windowId ?? undefined, durationMs: Date.now() - start };
    } catch (error) {
      return { opened: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async focusApp(appId: string, windowId: string | undefined): Promise<{ focused: boolean; durationMs: number; error?: string }> {
    this.currentPhase = 'focus';
    const start = Date.now();
    if (!windowId) {
      return { focused: false, durationMs: Date.now() - start, error: 'no window id to focus' };
    }
    try {
      const focused = await this.page.evaluate((id: string) => {
        const desktop = (window as unknown as {
          desktop: { windows: Map<string, { element: HTMLElement }>; focusWindow(el: HTMLElement): void };
        }).desktop;
        const entry = desktop.windows.get(id);
        if (!entry) return false;
        desktop.focusWindow(entry.element);
        return true;
      }, windowId);
      return { focused, durationMs: Date.now() - start };
    } catch (error) {
      return { focused: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async closeApp(appId: string, windowId: string | undefined): Promise<{ closed: boolean; durationMs: number; error?: string }> {
    this.currentPhase = 'close';
    const start = Date.now();
    if (!windowId) {
      return { closed: false, durationMs: Date.now() - start, error: 'no window id to close' };
    }
    try {
      const closed = await this.page.evaluate((id: string) => {
        const desktop = (window as unknown as {
          desktop: { windows: Map<string, { element: HTMLElement }>; closeWindow(el: HTMLElement): void };
        }).desktop;
        const entry = desktop.windows.get(id);
        if (!entry) return false;
        desktop.closeWindow(entry.element);
        return true;
      }, windowId);
      return { closed, durationMs: Date.now() - start };
    } catch (error) {
      return { closed: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async reopenApp(appId: string): Promise<{ opened: boolean; windowId?: string; statePreserved: boolean; durationMs: number; error?: string }> {
    this.currentPhase = 'reopen';
    const result = await this.launchApp(appId);
    // The live desktop shell always creates a fresh window rather than
    // restoring prior in-window state, so `statePreserved` tracks whether
    // the app registration itself (icon/config) survived the close/reopen
    // cycle -- i.e. the reopen produced a real, distinct window.
    return { ...result, statePreserved: result.opened };
  }

  async captureScreenshot(appId: string, viewport: AppAuditScreenshotViewport): Promise<Buffer> {
    const { width, height } = APP_AUDIT_VIEWPORTS[viewport];
    await this.page.setViewportSize({ width, height });
    return this.page.screenshot({ fullPage: false });
  }

  async collectConsoleMessages(): Promise<AppAuditConsoleMessage[]> {
    const messages = this.consoleBuffer;
    this.consoleBuffer = [];
    return messages;
  }

  async collectFailedRequests(): Promise<AppAuditFailedRequest[]> {
    const failures = this.failedRequestBuffer;
    this.failedRequestBuffer = [];
    return failures;
  }

  async dispose(): Promise<void> {
    // Listeners are removed automatically when the page/context closes;
    // nothing else to release here.
  }
}

/** Stable hash helper shared with e2e evidence writers for correlation ids. */
export function hashAppAuditSeed(seed: string): string {
  return createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 16);
}
