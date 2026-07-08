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

test('MCP Control, IDL Explorer, MCP++ Explorer, and ORB Auto-UI share descriptor registry and gateway envelopes', async ({ page }) => {
  const rawIPFSRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/v1/ipfs/')) rawIPFSRequests.push(request.url());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForDesktop(page);

  await launchApp(page, 'mcp-control');
  const mcpControl = page.locator('.mcp-control-app').first();
  await expect(mcpControl.locator('.mcp-descriptor-registry')).toBeVisible();
  await expect(mcpControl).toContainText('ipfs_kit_py');
  await expect(mcpControl).toContainText('ipfs_datasets_py');
  await expect(mcpControl).toContainText('ipfs_accelerate_py');
  await mcpControl.locator('button[data-capability-id="ipfs.datasets.operation.browse"]').first().click();
  await page.waitForFunction(() => (window as any).__lastMCPControlDescriptorEnvelope?.trace?.capability_id === 'ipfs.datasets.operation.browse');
  await assertLastEnvelope(page, '__lastMCPControlDescriptorEnvelope', 'mcp-control', 'ipfs.datasets.operation.browse');

  await launchApp(page, 'idl-explorer');
  const idl = page.locator('.generated-service-surface[data-app="idl-explorer"]').first();
  await expect(idl).toBeVisible();
  await expect(idl.locator('.descriptor-registry-summary')).toBeVisible();
  await expect(idl).toContainText('ipfs_kit_py');
  await expect(idl).toContainText('ipfs_datasets_py');
  await expect(idl).toContainText('ipfs_accelerate_py');
  await idl.locator('button[data-capability-id="ipfs.datasets.operation.browse"]').first().click();
  await page.waitForFunction(() => (window as any).__lastDescriptorInvocationEnvelope?.trace?.app_id === 'idl-explorer');
  await assertLastEnvelope(page, '__lastDescriptorInvocationEnvelope', 'idl-explorer', 'ipfs.datasets.operation.browse');
  await expect(idl.locator('.app-capability-envelope').first()).toContainText('event_dag_refs');

  await launchApp(page, 'mcp-plus-plus');
  const mcppp = page.locator('.generated-service-surface[data-app="mcp-plus-plus"]').first();
  await expect(mcppp).toBeVisible();
  await expect(mcppp.locator('.descriptor-method-schema').first()).toBeVisible();
  await mcppp.locator('button[data-capability-id="ipfs.accelerate.operation.telemetry"]').first().click();
  await page.waitForFunction(() => (window as any).__lastDescriptorInvocationEnvelope?.trace?.app_id === 'mcp-plus-plus');
  await assertLastEnvelope(page, '__lastDescriptorInvocationEnvelope', 'mcp-plus-plus', 'ipfs.accelerate.operation.telemetry');

  await launchApp(page, 'orb-auto-ui');
  const orb = page.locator('.generated-service-surface[data-app="orb-auto-ui"]').first();
  await expect(orb).toBeVisible();
  await expect(orb.locator('.orb-generated-launchers')).toBeVisible();
  await orb.locator('[data-launch-descriptor="ipfs_accelerate_py"]').click();
  const generated = page.locator('.generated-service-surface[data-app="orb-generated-ipfs_accelerate_py"]').first();
  await expect(generated).toBeVisible();
  await generated.locator('button[data-capability-id="ipfs.accelerate.operation.hardware_profile"]').first().click();
  await page.waitForFunction(() => (window as any).__lastDescriptorInvocationEnvelope?.trace?.app_id === 'orb-generated-ipfs_accelerate_py');
  await assertLastEnvelope(page, '__lastDescriptorInvocationEnvelope', 'orb-generated-ipfs_accelerate_py', 'ipfs.accelerate.operation.hardware_profile');
  await expect(generated.locator('.app-capability-envelope').first()).toContainText('receipt_refs');

  expect(rawIPFSRequests).toEqual([]);
});

async function assertLastEnvelope(
  page: import('@playwright/test').Page,
  globalName: string,
  appId: string,
  capabilityId: string,
): Promise<void> {
  const envelope = await page.evaluate(name => (window as any)[name], globalName);
  expect(envelope.schema).toBe('swissknife.app-result-envelope.v1');
  expect(envelope.trace.app_id).toBe(appId);
  expect(envelope.trace.capability_id).toBe(capabilityId);
  expect(['ok', 'degraded']).toContain(envelope.status);
  expect(envelope.receipt_refs[0].capability_id).toBe(capabilityId);
  expect(envelope.event_dag_refs[0].event_type).toBe('app_capability_invocation');
}

async function launchApp(page: import('@playwright/test').Page, appId: string): Promise<void> {
  await page.evaluate(async id => {
    await (window as any).__swissknifeDesktop.launchApp(id);
  }, appId);
  await page.locator('.window').last().locator('.window-loading').waitFor({ state: 'detached', timeout: 7_000 }).catch(() => undefined);
}

async function waitForDesktop(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('.desktop-icons', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    return !loading || loading.style.display === 'none';
  }, null, { timeout: 10_000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const desktop = (window as any).__swissknifeDesktop;
    return desktop?.apps?.has('mcp-control') && desktop?.apps?.has('orb-auto-ui');
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
    case '.mjs':
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
