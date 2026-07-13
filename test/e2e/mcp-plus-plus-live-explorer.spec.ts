import { createServer, type Server } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';
import type { AddressInfo } from 'net';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let server: Server;
let baseUrl = '';

test.beforeAll(async () => {
  server = await startStaticServer(join(process.cwd(), 'web'));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('MCP++ Explorer inspects all configured services and performs an explicit tool call', async ({ page }) => {
  await page.route(/^http:\/\/127\.0\.0\.1:(8014|3002|3003)\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    if (url.pathname.endsWith('/mcp/health')) {
      await route.fulfill(json({ status: 'ok' }));
      return;
    }
    if (url.pathname.endsWith('/mcp/helia/status')) {
      await route.fulfill(json({ enabled: true, dht_mode: 'client', dht_maintenance: 'on_demand', connection_count: 0, connection_limit: 4 }));
      return;
    }
    const body = request.postDataJSON() as { id?: string; method?: string };
    const results: Record<string, unknown> = {
      initialize: { protocolVersion: '2024-11-05', capabilities: { experimental: { 'mcp++/event-dag': true, 'mcp++/p2p-transport': true } } },
      'tools/list': { tools: [{ name: 'status', description: 'Read backend status', inputSchema: { type: 'object' } }] },
      'interfaces/list': { interfaces: [{ interface_cid: 'bafyinterface' }] },
      'mcp++/dag/frontier': { frontier: ['bafyfrontier'] },
      'mcp++/dag/archives': { archives: [] },
      'mcp++/p2p/peers': { peers: [{ id: 'peer-a' }] },
      'tools/call': { content: [{ type: 'text', text: '{"ok":true}' }] },
    };
    await route.fulfill(json({ jsonrpc: '2.0', id: body.id, result: results[body.method || ''] || {} }));
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForDesktop(page);
  await page.evaluate(async () => (window as any).__swissknifeDesktop.launchApp('mcp-plus-plus'));

  const explorer = page.locator('.mcp-plus-plus-explorer').first();
  await expect(explorer).toBeVisible();
  await expect(explorer).toContainText('3/3 MCP++ services responded.');
  await explorer.locator('button[data-tab="tools"]').click();
  await expect(explorer.locator('button[data-tool="status"]').first()).toBeVisible();
  await explorer.locator('button[data-action="execute-tool"]').click();
  await expect(explorer.locator('.mcppp-result-heading')).toContainText('Tool result');
  await expect(explorer.locator('.mcppp-output').last()).toContainText('ok');

  await explorer.locator('button[data-tab="protocol"]').click();
  await expect(explorer).toContainText('Profiles A-F Protocol Request');
  await explorer.locator('#mcppp-protocol-method').selectOption('mcp++/dag/archives');
  await explorer.locator('button[data-action="execute-protocol"]').click();
  await expect(explorer.locator('.mcppp-message')).toContainText('Protocol request completed.');
});

function json(value: unknown) {
  return { status: 200, headers: { ...corsHeaders(), 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

function corsHeaders() {
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
}

async function waitForDesktop(page: import('@playwright/test').Page) {
  await page.waitForSelector('.desktop-icons', { timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__swissknifeDesktop?.apps?.has('mcp-plus-plus'), null, { timeout: 20_000 });
}

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = normalize(join(webRoot, pathname));
    if (!filePath.startsWith(webRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': mimeType(filePath), 'cache-control': 'no-store' });
    response.end(readFileSync(filePath));
  });
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  return server;
}

function mimeType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    default: return 'application/octet-stream';
  }
}
