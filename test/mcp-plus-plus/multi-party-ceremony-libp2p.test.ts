import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MCPPPServerConnector } from '../../src/services/mcp/mcp-plus-plus-connector';
import { MCPp2pSession, type P2PStream } from '../../src/services/mcp/mcp-p2p-session';

const fixturePath = resolve(__dirname, '../../../Mcp-Plus-Plus/tests-py/fixtures/valid/profile_f_groth16_mpc_ceremony.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const ceremonyCid = 'sha256:645338f97ee9f1d17529c4be2b88f928b8bc4c19d906172f0ba0d269780f04b8';

function frame(message: unknown): Uint8Array {
  const payload = Buffer.from(JSON.stringify(message));
  const output = Buffer.alloc(4 + payload.length);
  output.writeUInt32BE(payload.length, 0);
  payload.copy(output, 4);
  return new Uint8Array(output);
}

class ProfileECeremonyStream implements P2PStream {
  private readonly inbound: Uint8Array[] = [];
  private wakeReader: (() => void) | null = null;
  private closed = false;

  async write(chunk: Uint8Array): Promise<void> {
    const size = Buffer.from(chunk).readUInt32BE(0);
    const request = JSON.parse(Buffer.from(chunk.subarray(4, 4 + size)).toString('utf8'));
    if (request.method === 'notifications/initialized') return;
    const response = this.responseFor(request);
    this.inbound.push(frame(response));
    this.wakeReader?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    while (!this.closed || this.inbound.length > 0) {
      const next = this.inbound.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>(resolveWake => { this.wakeReader = resolveWake; });
      this.wakeReader = null;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.wakeReader?.();
  }

  private responseFor(request: any): any {
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'ipfs-datasets-mcppp', version: '1.0.0' },
          capabilities: {
            tools: { listChanged: true },
            mcpPlusPlusProfiles: ['mcp++/event-dag'],
            experimental: {
              'mcp++/event-dag': true,
              'mcp++/groth16-mpc-ceremony': true,
            },
          },
        },
      };
    }
    if (request.method === 'tools/list') {
      return { jsonrpc: '2.0', id: request.id, result: { tools: [] } };
    }
    if (request.method === 'mcp++/zk/ceremony/validate') {
      expect(request.params.manifest).toEqual(fixture);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          valid: true,
          production_eligible: true,
          ceremony_cid: ceremonyCid,
          independent_contributors: ['did:key:z6MkhAlice', 'did:key:z6MkhBob'],
          reasons: [],
        },
      };
    }
    return { jsonrpc: '2.0', id: request.id, result: {} };
  }
}

describe('Profile E ceremony validation', () => {
  it('uses the same JSON-RPC ceremony validation method over MCP+p2p', async () => {
    const session = new MCPp2pSession(new ProfileECeremonyStream());
    await session.handshake({ name: 'swissknife-test', version: '1.0.0' });

    const connector = new MCPPPServerConnector({
      name: 'datasets-profile-e-test',
      baseUrl: 'http://unused.invalid',
      healthPath: '/health',
      mcpPath: '/mcp',
      toolsPath: '/tools',
      transport: 'libp2p',
    });
    const connected = await connector.useSession(session);

    expect(connected.success).toBe(true);
    expect(connected.profiles).toContain('mcp++/event-dag');
    await expect(connector.validateGroth16MpcCeremony(fixture)).resolves.toMatchObject({
      valid: true,
      production_eligible: true,
      ceremony_cid: ceremonyCid,
    });
    await connector.disconnect();
  });
});
