/**
 * SWR-047 — Browser libp2p bootstrap and relay matrix.
 *
 * These tests drive the real browser runtime through the existing Vite
 * harness. The matrix evidence is based on actual installed libp2p browser
 * modules and explicit package gaps; it does not install substitute transports.
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'libp2p-browser', 'bootstrap-matrix');

interface BootstrapMatrixReceipt {
  schema: 'swr_047_browser_libp2p_bootstrap_matrix_receipt_v1';
  task_id: 'SWR-047';
  project: string;
  scenario: string;
  initStatus: string | null;
  bootstrapMode: string | null;
  bootstrapReport: Record<string, unknown>;
  capabilityGaps: Array<Record<string, unknown>>;
  capabilityItems: string[];
  capturedAt: string;
}

test.beforeAll(() => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
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

async function readMatrix(page: Page, scenario: string, projectName: string): Promise<BootstrapMatrixReceipt> {
  const reportRaw = await page.getByTestId('bootstrap-report').textContent();
  const gapsRaw = await page.getByTestId('bootstrap-capability-gaps').textContent();
  const capabilityItems = await page.locator('[data-testid="capabilities-list"] li').allTextContents();
  return {
    schema: 'swr_047_browser_libp2p_bootstrap_matrix_receipt_v1',
    task_id: 'SWR-047',
    project: projectName,
    scenario,
    initStatus: await page.getByTestId('init-status').textContent(),
    bootstrapMode: await page.getByTestId('bootstrap-mode').textContent(),
    bootstrapReport: JSON.parse(reportRaw ?? '{}') as Record<string, unknown>,
    capabilityGaps: JSON.parse(gapsRaw ?? '[]') as Array<Record<string, unknown>>,
    capabilityItems,
    capturedAt: new Date().toISOString(),
  };
}

function writeReceipt(receipt: BootstrapMatrixReceipt): void {
  const safeProject = receipt.project.replace(/[^a-z0-9-]/gi, '-');
  const safeScenario = receipt.scenario.replace(/[^a-z0-9-]/gi, '-');
  fs.writeFileSync(
    path.join(RESULTS_DIR, `${safeProject}-${safeScenario}.json`),
    JSON.stringify(receipt, null, 2),
  );
}

function capability(
  report: Record<string, unknown>,
  name: 'webrtc' | 'websockets' | 'circuit-relay-v2' | 'gossipsub',
): Record<string, unknown> {
  const capabilities = report.capabilities as Record<string, Record<string, unknown>>;
  return capabilities[name];
}

test.describe('SWR-047 browser libp2p bootstrap relay capability matrix', () => {
  test('default bootstrap behavior configures WebRTC listen, relay bootstrap peers, and GossipSub', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page);
    const receipt = await readMatrix(page, 'default-bootstrap', testInfo.project.name);
    writeReceipt(receipt);

    expect(receipt.bootstrapMode).toBe('default');
    expect(receipt.initStatus).toBe('started');
    expect(receipt.bootstrapReport.defaultBootstrap).toBe(true);
    expect(receipt.bootstrapReport.listenMultiaddrs).toEqual(['/webrtc']);
    expect(receipt.bootstrapReport.bootstrapPeers).toEqual(
      expect.arrayContaining([expect.stringContaining('/p2p-circuit')]),
    );
    expect(receipt.bootstrapReport.simulatedTransports).toBe(false);
    expect(receipt.bootstrapReport.gossipSubAvailable).toBe(true);
    expect(capability(receipt.bootstrapReport, 'webrtc').configured).toBe(true);
    expect(capability(receipt.bootstrapReport, 'websockets').configured).toBe(true);
    expect(capability(receipt.bootstrapReport, 'circuit-relay-v2').configured).toBe(true);
    expect(capability(receipt.bootstrapReport, 'gossipsub').configured).toBe(true);
    expect(receipt.capabilityGaps).toEqual([]);
  });

  test('relay-only fallback reports circuit relay and WebSocket support without WebRTC', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page, '?scenario=relay-only');
    const receipt = await readMatrix(page, 'relay-only', testInfo.project.name);
    writeReceipt(receipt);

    expect(receipt.bootstrapMode).toBe('relay-only');
    expect(receipt.bootstrapReport.listenMultiaddrs).toEqual(['/p2p-circuit']);
    expect(receipt.bootstrapReport.relayOnlyFallback).toBe(true);
    expect(receipt.bootstrapReport.simulatedTransports).toBe(false);
    expect(capability(receipt.bootstrapReport, 'webrtc').requested).toBe(false);
    expect(capability(receipt.bootstrapReport, 'webrtc').configured).toBe(false);
    expect(capability(receipt.bootstrapReport, 'websockets').configured).toBe(true);
    expect(capability(receipt.bootstrapReport, 'circuit-relay-v2').configured).toBe(true);
    expect(receipt.capabilityGaps).toEqual([]);
  });

  test('WebRTC unavailable mode reports an explicit capability gap without a substitute transport', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page, '?scenario=missing-webrtc');
    const receipt = await readMatrix(page, 'webrtc-unavailable', testInfo.project.name);
    writeReceipt(receipt);

    expect(receipt.bootstrapMode).toBe('default');
    expect(receipt.initStatus).toBe('error');
    expect(receipt.bootstrapReport.webRTCUnavailable).toBe(true);
    expect(receipt.bootstrapReport.simulatedTransports).toBe(false);
    expect(capability(receipt.bootstrapReport, 'webrtc').requested).toBe(true);
    expect(capability(receipt.bootstrapReport, 'webrtc').installed).toBe(false);
    expect(capability(receipt.bootstrapReport, 'webrtc').configured).toBe(false);
    expect(receipt.capabilityGaps).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'webrtc', packageName: '@libp2p/webrtc' })]),
    );
    expect(receipt.capabilityItems.join('\n')).not.toMatch(/\b(fake|stub|mock)\b/i);
  });

  test('WebSocket-only mode disables WebRTC and circuit relay while keeping real WebSockets', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page, '?scenario=websocket-only');
    const receipt = await readMatrix(page, 'websocket-only', testInfo.project.name);
    writeReceipt(receipt);

    expect(receipt.bootstrapMode).toBe('websocket-only');
    expect(receipt.bootstrapReport.webSocketOnly).toBe(true);
    expect(receipt.bootstrapReport.listenMultiaddrs).toEqual([]);
    expect(receipt.bootstrapReport.bootstrapPeers).toEqual(
      expect.arrayContaining([expect.stringContaining('/wss/')]),
    );
    expect(receipt.bootstrapReport.simulatedTransports).toBe(false);
    expect(capability(receipt.bootstrapReport, 'webrtc').requested).toBe(false);
    expect(capability(receipt.bootstrapReport, 'circuit-relay-v2').requested).toBe(false);
    expect(capability(receipt.bootstrapReport, 'websockets').configured).toBe(true);
    expect(receipt.capabilityGaps).toEqual([]);
  });

  test('GossipSub availability is reported as a real pubsub capability', async ({ page }, testInfo) => {
    await gotoScenario(page);
    const receipt = await readMatrix(page, 'gossipsub-availability', testInfo.project.name);
    writeReceipt(receipt);

    expect(receipt.bootstrapReport.gossipSubAvailable).toBe(true);
    expect(capability(receipt.bootstrapReport, 'gossipsub')).toEqual(
      expect.objectContaining({
        requested: true,
        installed: true,
        configured: true,
        packageName: '@chainsafe/libp2p-gossipsub',
      }),
    );
  });

  test('capability-gap reporting covers multiple absent packages without simulated transports', async ({
    page,
  }, testInfo) => {
    await gotoScenario(page, '?scenario=missing-multiple');
    const receipt = await readMatrix(page, 'multiple-capability-gaps', testInfo.project.name);
    writeReceipt(receipt);

    expect(receipt.bootstrapReport.simulatedTransports).toBe(false);
    expect(receipt.capabilityGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'webrtc' }),
        expect.objectContaining({ name: 'circuit-relay-v2' }),
        expect.objectContaining({ name: 'gossipsub' }),
      ]),
    );
    expect(capability(receipt.bootstrapReport, 'websockets').configured).toBe(true);
    expect(capability(receipt.bootstrapReport, 'gossipsub').configured).toBe(false);
    expect(receipt.capabilityItems.join('\n')).not.toMatch(/\b(fake|stub|mock)\b/i);
  });
});
