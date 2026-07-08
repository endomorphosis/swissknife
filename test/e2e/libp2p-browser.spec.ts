/**
 * SWR-028 — Browser libp2p Playwright evidence.
 *
 * Drives the real, production browser libp2p runtime
 * (src/services/mcp/libp2p-browser-runtime.ts) and the real MCP+p2p session
 * state machine (src/services/mcp/mcp-p2p-session.ts) inside actual desktop
 * and mobile browser engines via the harness in
 * test/e2e/fixtures/libp2p-browser-harness. See build-tools/configs/
 * playwright.libp2p-browser.config.ts for the desktop/mobile project matrix
 * and docs/browser-libp2p-evidence.md for the evidence write-up.
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'libp2p-browser');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');

const CAPABILITY_NAMES = [
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'noise',
  'yamux',
  'identify',
  'gossipsub',
];

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

async function waitForHarnessReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="harness-ready"][data-ready="true"]', { timeout: 30_000 });
}

async function gotoScenario(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await waitForHarnessReady(page);
  const fatalError = await page.getByTestId('harness-ready').getAttribute('data-fatal-error');
  expect(fatalError, `harness fatal error: ${fatalError}`).toBeNull();
}

function screenshotPath(testInfo: { project: { name: string } }, label: string): string {
  const safeProject = testInfo.project.name.replace(/[^a-z0-9-]/gi, '-');
  return path.join(SCREENSHOTS_DIR, `${safeProject}-${label}.png`);
}

test.describe('SWR-028 browser libp2p Playwright evidence', () => {
  test('captures real browser libp2p initialization with all optional capabilities configured', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page);

    await expect(page.getByTestId('init-status')).toHaveText('started');
    const detail = await page.getByTestId('init-detail').textContent();
    expect(detail).toMatch(/peerId=12D3Koo/);
    expect(detail).toContain('listen multiaddrs=["/webrtc"]');

    const capabilityItems = await page.locator('[data-testid="capabilities-list"] li').allTextContents();
    expect(capabilityItems).toHaveLength(CAPABILITY_NAMES.length);

    for (const name of CAPABILITY_NAMES) {
      const item = page.getByTestId(`capability-${name}`);
      await expect(item).toHaveAttribute('data-installed', 'true');
      await expect(item).toHaveAttribute('data-configured', 'true');
    }

    await expect(page.getByTestId('gaps-empty')).toBeVisible();

    await page.screenshot({ path: screenshotPath(testInfo, 'available'), fullPage: true });
  });

  test('reports an unavailable optional package as a capability gap instead of a silent fallback', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page, '?scenario=missing-webrtc');

    const gapItem = page.getByTestId('gap-webrtc');
    await expect(gapItem).toBeVisible();
    const gapText = (await gapItem.textContent()) ?? '';
    expect(gapText).toContain('@libp2p/webrtc');
    expect(gapText.toLowerCase()).toContain('unavailable');

    // The remaining capabilities are still real, installed, and configured —
    // the gap does not silently replace webrtc with a fake transport.
    await expect(page.getByTestId('capability-websockets')).toHaveAttribute('data-configured', 'true');
    await expect(page.getByTestId('capability-circuit-relay-v2')).toHaveAttribute('data-configured', 'true');

    // With webrtc missing, the default `/webrtc` listen multiaddr has no
    // matching transport, so the real node start attempt fails — a genuine,
    // deterministic consequence of the gap rather than a silent success.
    await expect(page.getByTestId('init-status')).toHaveText('error');

    await page.screenshot({ path: screenshotPath(testInfo, 'missing-webrtc'), fullPage: true });
  });

  test('reports multiple unavailable optional packages independently', async ({ page }) => {
    await gotoScenario(page, '?scenario=missing-multiple');

    for (const name of ['webrtc', 'circuit-relay-v2', 'gossipsub']) {
      await expect(page.getByTestId(`gap-${name}`)).toBeVisible();
    }
    await expect(page.getByTestId('capability-websockets')).toHaveAttribute('data-configured', 'true');
    await expect(page.getByTestId('capability-noise')).toHaveAttribute('data-configured', 'true');
  });

  test('disables the browser libp2p runtime entirely when the scenario requests it', async ({ page }) => {
    await gotoScenario(page, '?scenario=disabled');

    await expect(page.getByTestId('init-status')).toHaveText('disabled');
    await expect(page.locator('[data-testid="capabilities-list"] li')).toHaveCount(0);
    await expect(page.getByTestId('gaps-empty')).toBeVisible();
  });

  test('surfaces the default relay/bootstrap configuration', async ({ page }) => {
    await gotoScenario(page);

    const listen = await page.getByTestId('relay-listen').textContent();
    expect(listen).toContain('/webrtc');

    const rendezvous = await page.getByTestId('relay-rendezvous').textContent();
    expect(rendezvous).toContain('/p2p-circuit');

    const bootstrapPeersRaw = await page.getByTestId('relay-bootstrap-peers').textContent();
    const bootstrapPeers = JSON.parse(bootstrapPeersRaw ?? '[]') as string[];
    expect(bootstrapPeers.length).toBeGreaterThan(0);
    expect(bootstrapPeers[0]).toContain('/p2p-circuit');
  });

  test('surfaces custom relay/bootstrap configuration and a real circuit-relay listen failure without a reachable relay peer', async ({
    page,
  }, testInfo) => {
    const relay = '/dns4/relay.example.org/tcp/443/wss/p2p/12D3KooWCustomRelayPeerExampleAAAAAAAAAAAAAAAAAAAAAAAA';
    const bootstrapPeer = '/ip4/203.0.113.10/tcp/4001/p2p/12D3KooWBootstrapPeerExampleBBBBBBBBBBBBBBBBBBBBBBBBBB';

    await gotoScenario(
      page,
      `?relayListen=true&relay=${encodeURIComponent(relay)}&bootstrap=${encodeURIComponent(bootstrapPeer)}`,
    );

    const listen = await page.getByTestId('relay-listen').textContent();
    expect(listen).toContain('/p2p-circuit');

    const rendezvous = await page.getByTestId('relay-rendezvous').textContent();
    expect(rendezvous).toBe(relay);

    const bootstrapPeersRaw = await page.getByTestId('relay-bootstrap-peers').textContent();
    expect(JSON.parse(bootstrapPeersRaw ?? '[]')).toEqual([bootstrapPeer]);

    // All capabilities are still real and configured; only the *listen*
    // attempt against a circuit-relay address fails, because no relay peer
    // is actually reachable in this CI-safe evidence run.
    await expect(page.getByTestId('gaps-empty')).toBeVisible();
    await expect(page.getByTestId('init-status')).toHaveText('error');
    const detail = await page.getByTestId('init-detail').textContent();
    expect(detail).toMatch(/circuit-relay-v2-transport/);

    await page.screenshot({ path: screenshotPath(testInfo, 'relay-bootstrap-config'), fullPage: true });
  });

  test('drives the real MCP+p2p session through a successful handshake', async ({ page }, testInfo) => {
    await gotoScenario(page, '?p2p=success');

    await expect(page.getByTestId('p2p-status')).toHaveText('open');
    const detail = await page.getByTestId('p2p-detail').textContent();
    expect(detail).toContain('protocol 2024-11-05');
    expect(detail).toContain('mcp++/ucan');

    await page.screenshot({ path: screenshotPath(testInfo, 'p2p-success'), fullPage: true });
  });

  test('drives the real MCP+p2p session through a rejected handshake', async ({ page }, testInfo) => {
    await gotoScenario(page, '?p2p=error');

    await expect(page.getByTestId('p2p-status')).toHaveText('error');
    const detail = await page.getByTestId('p2p-detail').textContent();
    expect(detail).toContain('Simulated relay rejection');

    await page.screenshot({ path: screenshotPath(testInfo, 'p2p-error'), fullPage: true });
  });

  test('drives the real MCP+p2p session through a connection timeout', async ({ page }) => {
    await gotoScenario(page, '?p2p=timeout');

    await expect(page.getByTestId('p2p-status')).toHaveText('error');
    const detail = await page.getByTestId('p2p-detail').textContent();
    expect(detail).toMatch(/timed out/i);
  });

  test('reports real peer-discovery optional package availability', async ({ page }) => {
    await gotoScenario(page);

    const mdnsText = await page.getByTestId('discovery-mdns').textContent();
    const kadDhtText = await page.getByTestId('discovery-kad-dht').textContent();
    expect(mdnsText).toContain('@libp2p/mdns');
    expect(kadDhtText).toContain('@libp2p/kad-dht');
  });

  test('renders a viewport-appropriate layout for this project', async ({ page }, testInfo) => {
    await gotoScenario(page);

    const layout = await page.locator('body').getAttribute('data-layout');
    const viewport = page.viewportSize();
    const expectedLayout = viewport && viewport.width <= 600 ? 'mobile' : 'desktop';
    expect(layout).toBe(expectedLayout);

    const banner = await page.getByTestId('viewport-banner').textContent();
    expect(banner).toContain(expectedLayout);

    await page.screenshot({ path: screenshotPath(testInfo, `viewport-${expectedLayout}`), fullPage: true });
  });

  test('collects an aggregated evidence receipt for docs/browser-libp2p-evidence.md', async ({ page }, testInfo) => {
    await gotoScenario(page, '?p2p=success');

    const capabilities = await page.locator('[data-testid="capabilities-list"] li').allTextContents();
    const discovery = await page.locator('[data-testid="discovery-list"] li').allTextContents();
    const initStatus = await page.getByTestId('init-status').textContent();
    const initDetail = await page.getByTestId('init-detail').textContent();
    const p2pStatus = await page.getByTestId('p2p-status').textContent();
    const p2pDetail = await page.getByTestId('p2p-detail').textContent();
    const layout = await page.locator('body').getAttribute('data-layout');
    const viewport = page.viewportSize();

    const receipt = {
      schema: 'swr_028_browser_libp2p_evidence_receipt_v1',
      task_id: 'SWR-028',
      depends_on: ['SWR-015', 'SWR-016'],
      project: testInfo.project.name,
      viewport,
      layout,
      initStatus,
      initDetail,
      capabilities,
      discovery,
      p2pStatus,
      p2pDetail,
      capturedAt: new Date().toISOString(),
    };

    const safeProject = testInfo.project.name.replace(/[^a-z0-9-]/gi, '-');
    fs.writeFileSync(
      path.join(RESULTS_DIR, `evidence-${safeProject}.json`),
      JSON.stringify(receipt, null, 2),
    );

    expect(initStatus).toBe('started');
    expect(p2pStatus).toBe('open');
  });
});
