import { createServer, type Server } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';
import type { AddressInfo } from 'net';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let server: Server;
let baseUrl = '';

test.beforeAll(async () => {
  server = await startStaticServer(join(process.cwd(), 'web'));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('routes Terminal IPFS commands through the app capability gateway', async ({ page }) => {
  const rawIPFSRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/v1/ipfs/')) rawIPFSRequests.push(request.url());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForDesktop(page);
  await page.locator('.desktop-icons [data-app="terminal"]').click({ force: true });

  const terminalWindow = page.locator('.window').last();
  await expect(terminalWindow).toBeVisible();
  await terminalWindow.locator('.window-loading').waitFor({ state: 'detached', timeout: 7_000 }).catch(() => undefined);
  const input = terminalWindow.locator('.terminal-input').first();
  await expect(input).toBeVisible();

  const commands: Array<[string, string]> = [
    ['ipfs status', 'ipfs.kit.tool.node_id'],
    ['ipfs add gateway-test-content', 'ipfs.kit.tool.ipfs_add'],
    ['ipfs cat bafybeigatewaytest', 'ipfs.kit.tool.ipfs_cat'],
    ['ipfs pin bafybeigatewaytest', 'ipfs.kit.tool.pin_add'],
    ['ipfs unpin bafybeigatewaytest', 'ipfs.kit.tool.pin_rm'],
    ['ipfs pins', 'ipfs.kit.tool.get_pinset'],
    ['ipfs stat bafybeigatewaytest', 'ipfs.kit.tool.block_stat'],
    ['ipfs dag get bafybeigatewaytest', 'ipfs.kit.tool.dag_get'],
    ['ipfs dag put {"hello":"world"}', 'ipfs.kit.tool.dag_put'],
    ['ipfs name publish /ipfs/bafybeigatewaytest k51gateway', 'ipfs.kit.tool.name_publish'],
    ['ipfs name resolve k51gateway', 'ipfs.kit.tool.name_resolve'],
  ];

  for (const [command, capabilityId] of commands) {
    await input.fill(command);
    await input.press('Enter');
    await page.waitForFunction(
      expected => (window as any).__lastSwissKnifeCapabilityEnvelope?.trace?.capability_id === expected,
      capabilityId,
      { timeout: 5_000 },
    );
    const envelope = await page.evaluate(() => (window as any).__lastSwissKnifeCapabilityEnvelope);
    expect(envelope.schema).toBe('swissknife.app-result-envelope.v1');
    expect(envelope.trace.app_id).toBe('terminal');
    expect(envelope.trace.capability_id).toBe(capabilityId);
    expect(['ok', 'degraded']).toContain(envelope.status);
    expect(envelope.receipt_refs[0].capability_id).toBe(capabilityId);
  }

  const text = await terminalWindow.textContent();
  expect(text).toContain('App Capability Envelope');
  expect(text).toContain('swissknife.app-result-envelope.v1');
  expect(text).not.toContain('IPFS command not fully implemented yet');
  expect(rawIPFSRequests).toEqual([]);
});

async function waitForDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('.desktop-icons', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    return !loading || loading.style.display === 'none';
  }, null, { timeout: 10_000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const desktop = (window as any).__swissknifeDesktop;
    return desktop?.apps?.has('terminal');
  }, null, { timeout: 20_000 });
}

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = normalize(join(webRoot, pathname));
    if (!filePath.startsWith(webRoot)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeType(filePath),
      'cache-control': 'no-store',
    });
    response.end(readFileSync(filePath));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

function mimeType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}
