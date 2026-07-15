/**
 * SWR-138: real browser-to-browser libp2p interoperability.
 *
 * Each project owns two independently-created browser contexts.  The only
 * host process is a real Circuit Relay v2 server; it is never used as a
 * browser transport or protocol peer.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'libp2p-browser');
const RELAY_SCRIPT = path.join(process.cwd(), 'test/e2e/fixtures/libp2p-browser-harness/relay-server.mjs');

type RelayReceipt = { type: 'swr-138-relay-ready'; peerId: string; multiaddr: string; encryption: string; multiplexer: string };
type NodeReceipt = { peerId: string; relayEndpoint: string };
type FailureReceipt = { schema: string; kind: string; code: string; phase: string; cause: string; at: string };

function startRelay(): Promise<{ child: ChildProcessWithoutNullStreams; receipt: RelayReceipt }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RELAY_SCRIPT], { cwd: process.cwd(), env: { ...process.env, SWISSKNIFE_LIBP2P_RELAY_PORT: '0' } });
    let output = '';
    const deadline = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out waiting for local libp2p relay readiness: ${output}`));
    }, 30_000);
    child.stdout.on('data', chunk => {
      output += String(chunk);
      for (const line of output.split('\n')) {
        try {
          const receipt = JSON.parse(line) as RelayReceipt;
          if (receipt.type === 'swr-138-relay-ready') {
            clearTimeout(deadline);
            resolve({ child, receipt });
            return;
          }
        } catch { /* wait for a complete JSON line */ }
      }
    });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.once('error', error => { clearTimeout(deadline); reject(error); });
    child.once('exit', code => {
      if (!output.includes('swr-138-relay-ready')) {
        clearTimeout(deadline);
        reject(new Error(`Local libp2p relay exited before readiness (code ${code}): ${output}`));
      }
    });
  });
}

async function stopRelay(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Local relay did not stop cleanly')); }, 10_000);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Local relay exited with ${code}`));
    });
    child.kill('SIGTERM');
  });
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 30_000 });
}

async function startBrowserNode(page: Page, relay: string): Promise<NodeReceipt> {
  return page.evaluate(async multiaddr => (window as any).swr138Libp2p.start(multiaddr), relay) as Promise<NodeReceipt>;
}

function writeEvidence(project: string, receipt: Record<string, unknown>): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `swr-138-${project}.json`), JSON.stringify(receipt, null, 2));
}

test.describe('SWR-138 default browser libp2p interoperability', () => {
  test('uses a real relay and signed protocol exchange across two isolated contexts', async ({ browser }, testInfo) => {
    const relay = await startRelay();
    let senderContext: BrowserContext | undefined;
    let receiverContext: BrowserContext | undefined;
    let senderPage: Page | undefined;
    let receiverPage: Page | undefined;
    const teardown: Array<Record<string, unknown>> = [];

    try {
      // Explicitly create contexts instead of using the page fixture: context
      // storage, permissions, and browser libp2p identities must not leak.
      senderContext = await browser.newContext({ ignoreHTTPSErrors: true });
      receiverContext = await browser.newContext({ ignoreHTTPSErrors: true });
      senderPage = await senderContext.newPage();
      receiverPage = await receiverContext.newPage();
      await Promise.all([ready(senderPage), ready(receiverPage)]);

      const receiver = await startBrowserNode(receiverPage, relay.receipt.multiaddr);
      await receiverPage.evaluate(() => (window as any).swr138Libp2p.registerResponder());
      const sender = await startBrowserNode(senderPage, relay.receipt.multiaddr);
      expect(sender.peerId).not.toBe(receiver.peerId);
      expect(sender.relayEndpoint).toContain('/p2p-circuit');
      expect(receiver.relayEndpoint).toContain('/p2p-circuit');

      const exchange = await senderPage.evaluate(
        async receiverInfo => (window as any).swr138Libp2p.exchange(receiverInfo.relayEndpoint, receiverInfo.peerId), receiver,
      ) as Record<string, unknown>;
      expect(exchange.protocol).toBe('/swissknife/swr-138/signed-request/1.0.0');
      expect(exchange.requestSignatureVerified).toBe(true);
      expect(exchange.responseSignatureVerified).toBe(true);
      expect(String((exchange.negotiation as Record<string, unknown>).encryption)).toMatch(/noise/i);
      expect(String((exchange.negotiation as Record<string, unknown>).multiplexer)).toMatch(/yamux/i);

      const missingCapability = await senderPage.evaluate(() => (window as any).swr138Libp2p.captureMissingCapability()) as FailureReceipt;
      const permissionBlocked = await senderPage.evaluate(() => (window as any).swr138Libp2p.capturePermissionBlocked()) as FailureReceipt;
      const timeout = await senderPage.evaluate(
        async receiverInfo => (window as any).swr138Libp2p.captureTimeout(receiverInfo.relayEndpoint), receiver,
      ) as FailureReceipt;
      for (const receipt of [missingCapability, permissionBlocked, timeout]) {
        expect(receipt.schema).toBe('swr-138.browser-libp2p.failure.v1');
        expect(receipt.cause.length).toBeGreaterThan(0);
      }
      expect(missingCapability.kind).toBe('missing-capability');
      expect(permissionBlocked.kind).toBe('permission-blocked');
      expect(timeout.kind).toBe('timeout');

      await stopRelay(relay.child);
      const relayLost = await senderPage.evaluate(
        async receiverInfo => (window as any).swr138Libp2p.captureRelayLoss(receiverInfo.relayEndpoint), receiver,
      ) as FailureReceipt;
      expect(relayLost).toMatchObject({ schema: 'swr-138.browser-libp2p.failure.v1', kind: 'relay-lost', code: 'relay-route-unavailable' });

      const receipt = {
        schema: 'swr-138.browser-libp2p.interoperability-receipt.v1', taskId: 'SWR-138', engine: testInfo.project.name,
        contexts: { isolated: true, senderPeerId: sender.peerId, receiverPeerId: receiver.peerId },
        relay: relay.receipt, protocol: exchange, failures: [missingCapability, permissionBlocked, timeout, relayLost],
        capturedAt: new Date().toISOString(),
      };
      writeEvidence(testInfo.project.name, receipt);
    } finally {
      if (senderPage) {
        try { teardown.push(await senderPage.evaluate(() => (window as any).swr138Libp2p.stop())); } catch (error) { teardown.push({ side: 'sender', error: String(error) }); }
      }
      if (receiverPage) {
        try { teardown.push(await receiverPage.evaluate(() => (window as any).swr138Libp2p.stop())); } catch (error) { teardown.push({ side: 'receiver', error: String(error) }); }
      }
      await senderContext?.close();
      await receiverContext?.close();
      await stopRelay(relay.child).catch(error => teardown.push({ side: 'relay', error: String(error) }));
      expect(teardown.every(item => item.stopped !== false)).toBe(true);
    }
  });
});
