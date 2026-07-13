import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MCPPPServerConnector } from '../../src/services/mcp/mcp-plus-plus-connector';

const fixturePath = resolve(__dirname, '../../../Mcp-Plus-Plus/tests-py/fixtures/valid/profile_f_groth16_mpc_ceremony.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const ceremonyCid = 'sha256:645338f97ee9f1d17529c4be2b88f928b8bc4c19d906172f0ba0d269780f04b8';

function nodeFetch(url: string, init: any = {}): Promise<any> {
  return new Promise((resolveFetch, reject) => {
    const parsed = new URL(url);
    const request = httpRequest({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method || 'GET',
      headers: init.headers || {},
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk as Buffer));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const status = response.statusCode || 0;
        resolveFetch({
          ok: status >= 200 && status < 300,
          status,
          json: async () => JSON.parse(body || 'null'),
        });
      });
    });
    request.on('error', reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

function readBody(request: any): Promise<any> {
  return new Promise(resolveBody => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')));
  });
}

describe('Profile F ceremony connector', () => {
  let server: Server;
  let baseUrl: string;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    (globalThis as any).fetch = nodeFetch;
    server = createServer(async (request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/health') {
        response.end(JSON.stringify({ status: 'ready' }));
        return;
      }
      if (request.url === '/tools') {
        response.end(JSON.stringify({ tools: [] }));
        return;
      }
      if (request.url !== '/mcp') {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      const body = await readBody(request);
      if (body.method === 'initialize') {
        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { experimental: { 'mcp++/event-dag': true, 'mcp++/groth16-mpc-ceremony': true } },
            serverInfo: { name: 'datasets-test', version: '1' },
          },
        }));
        return;
      }
      if (body.method === 'tools/list') {
        response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }));
        return;
      }
      if (body.method === 'mcp++/zk/ceremony/validate') {
        expect(body.params.manifest).toEqual(fixture);
        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            valid: true,
            production_eligible: true,
            ceremony_cid: ceremonyCid,
            independent_contributors: ['did:key:z6MkhAlice', 'did:key:z6MkhBob'],
            reasons: [],
          },
        }));
        return;
      }
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'not found' } }));
    });
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    (globalThis as any).fetch = originalFetch;
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  });

  it('uses the active MCP transport to independently validate a public manifest', async () => {
    const connector = new MCPPPServerConnector({
      name: 'datasets-test',
      baseUrl,
      healthPath: '/health',
      mcpPath: '/mcp',
      toolsPath: '/tools',
    });

    const connected = await connector.connect();
    expect(connected.success).toBe(true);
    expect(connected.profiles).toContain('mcp++/event-dag');
    await expect(connector.validateGroth16MpcCeremony(fixture)).resolves.toMatchObject({
      valid: true,
      production_eligible: true,
      ceremony_cid: ceremonyCid,
    });
  });
});
