import { evaluateProfileDExecution } from '../../src/services/mcp/profile-d-policy';
import { dagJsonCid } from '../../src/services/mcp/ipld-cid';
import { MCPPPServerConnector } from '../../src/services/mcp/mcp-plus-plus-connector';
import { MCPp2pSession, type P2PStream } from '../../src/services/mcp/mcp-p2p-session';

function frame(payload: unknown): Uint8Array {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const result = Buffer.allocUnsafe(body.length + 4);
  result.writeUInt32BE(body.length, 0);
  body.copy(result, 4);
  return result;
}

function profileDSessionStream(): P2PStream {
  const queued: Uint8Array[] = [];
  let resolveNext: ((value: IteratorResult<Uint8Array>) => void) | null = null;
  let closed = false;

  const enqueue = (payload: unknown) => {
    const encoded = frame(payload);
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ value: encoded, done: false });
    } else {
      queued.push(encoded);
    }
  };

  return {
    write(chunk: Uint8Array) {
      const data = Buffer.from(chunk);
      const request = JSON.parse(data.subarray(4, 4 + data.readUInt32BE(0)).toString('utf8')) as {
        id?: number;
        method?: string;
      };
      if (request.id === undefined) return;
      if (request.method === 'initialize') {
        enqueue({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'profile-d-peer', version: '1.0.0' },
            capabilities: {
              tools: {},
              mcpPlusPlusProfiles: ['mcp++/deontic-policy', 'mcp++/p2p-transport'],
              experimental: { 'mcp++/deontic-policy': true, 'mcp++/p2p-transport': true },
            },
          },
        });
      } else if (request.method === 'tools/list') {
        enqueue({ jsonrpc: '2.0', id: request.id, result: { tools: [] } });
      } else if (request.method === 'mcp++/policy/evaluate') {
        enqueue({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            decision: 'deny',
            allowed: false,
            obligations: [],
            zkp_certificate: { status: 'statement_ready', zero_knowledge: false, proof: null },
          },
        });
      }
    },
    close() {
      closed = true;
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ value: undefined as unknown as Uint8Array, done: true });
      }
    },
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        if (queued.length > 0) {
          yield queued.shift()!;
          continue;
        }
        const next = await new Promise<IteratorResult<Uint8Array>>(resolve => { resolveNext = resolve; });
        if (next.done) return;
        yield next.value;
      }
    },
  };
}

describe('MCP++ Profile D TypeScript policy evaluator', () => {
  it('denies a prohibition even when a permission also matches', () => {
    const result = evaluateProfileDExecution({
      actor: 'did:key:alice',
      action: 'tools.call',
      resource: 'dataset/private',
      policy: {
        clauses: [
          { clause_type: 'permission', actor: 'did:key:alice', action: 'tools.call', resource: 'dataset/*' },
          { clause_type: 'prohibition', actor: 'did:key:alice', action: 'tools.call', resource: 'dataset/private' },
        ],
      },
    });

    expect(result.decision).toBe('deny');
    expect(result.allowed).toBe(false);
  });

  it('returns formal logic and a ZKP-ready statement without claiming a proof', () => {
    const result = evaluateProfileDExecution({
      actor: 'did:key:alice',
      action: 'tools.call',
      policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:alice', action: 'tools.call' }] },
      request_zkp_certificate: true,
    });

    expect(result.decision).toBe('allow');
    expect(result.formal_logic).toEqual(['P(did:key:alice,tools.call,*)']);
    expect(result.policy_cid).toMatch(/^baguq[a-z2-7]+$/);
    expect(result.zkp_certificate?.statement_cid).toMatch(/^baguq[a-z2-7]+$/);
    expect(result.zkp_certificate).toMatchObject({ status: 'statement_ready', zero_knowledge: false, proof: null });
  });

  it('uses the byte-identical CIDv1 DAG-JSON encoding shared with ipfs_datasets_py', () => {
    expect(dagJsonCid({ a: '\u2603', z: 1 })).toBe(
      'baguqeerausriiweve7okk2irpre4z5pfzuaor25lfxrcsyjztulxop47sr3a',
    );
    const result = evaluateProfileDExecution({
      actor: 'did:key:alice',
      action: 'tools.call',
      resource: 'dataset/a',
      evaluated_at: '2026-07-12T00:00:00Z',
      policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:alice', action: 'tools.call', resource: 'dataset/a' }] },
    });
    expect(result.policy_cid).toBe('baguqeerapeyo4eqtwmbbhp35meanl5i5zefcfd64ze4bzdxya66lbsy56mna');
  });

  it('uses the Profile D REST alias after HTTP capability negotiation', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; body?: string }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      const body = url.endsWith('/mcp')
        ? (() => {
          const rpc = JSON.parse(String(init?.body || '{}'));
          if (rpc.method === 'initialize') {
            return { jsonrpc: '2.0', id: rpc.id, result: {
              protocolVersion: '2024-11-05', serverInfo: { name: 'profile-d-http', version: '1.0.0' },
              capabilities: { experimental: { 'mcp++/deontic-policy': true } },
            } };
          }
          return { jsonrpc: '2.0', id: rpc.id, result: { tools: [] } };
        })()
        : {
          decision: 'allow', allowed: true, obligations: [],
          zkp_certificate: { status: 'statement_ready', zero_knowledge: false, proof: null },
        };
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as typeof globalThis.fetch;

    try {
      const connector = new MCPPPServerConnector({
        name: 'profile-d-http', baseUrl: 'http://profile-d.test', mcpPath: '/mcp',
        toolsPath: '/mcp/tools/list', healthPath: '/health', policyPath: '/mcp/policy/evaluate',
      });
      await connector.connect();
      const decision = await connector.evaluateProfileDPolicy({
        actor: 'did:key:alice', action: 'tools.call',
        policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:alice', action: 'tools.call' }] },
        request_zkp_certificate: true,
      });
      expect(decision).toMatchObject({ decision: 'allow', allowed: true });
      expect(requests.at(-1)?.url).toBe('http://profile-d.test/mcp/policy/evaluate');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the JSON-RPC policy method over a negotiated libp2p session', async () => {
    const session = new MCPp2pSession(profileDSessionStream());
    await session.handshake({ name: 'swissknife-profile-d-test', version: '1.0.0' });
    const connector = new MCPPPServerConnector({
      name: 'profile-d-p2p', baseUrl: 'http://unused.test', mcpPath: '/mcp',
      toolsPath: '/mcp/tools/list', healthPath: '/health', transport: 'libp2p',
    });
    await connector.useSession(session);
    const decision = await connector.evaluateProfileDPolicy({
      actor: 'did:key:alice', action: 'tools.call',
      policy: { clauses: [{ clause_type: 'prohibition', actor: 'did:key:alice', action: 'tools.call' }] },
      request_zkp_certificate: true,
    });

    expect(decision).toMatchObject({ decision: 'deny', allowed: false });
    await session.close();
  });
});
