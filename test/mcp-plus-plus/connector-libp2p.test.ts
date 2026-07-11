/**
 * MCP++ Profile E — connector-over-libp2p tests.
 *
 * Proves that SwissKnife's MCPPPServerConnector can call the ipfs_kit_py /
 * ipfs_datasets_py / ipfs_accelerate_py MCP servers over the MCP+p2p
 * (`/mcp+p2p/1.0.0`) transport by binding to a real MCPp2pSession running on a
 * mock length-prefixed stream. The mock stream stands in for a libp2p stream and
 * echoes JSON-RPC responses using the exact u32-BE framing the servers speak.
 */

import { describe, it, expect } from '@jest/globals';
import { MCPp2pSession, P2PStream } from '../../src/services/mcp/mcp-p2p-session';
import {
  MCPPPServerConnector,
  IPFS_KIT_SERVER,
  createMultiServerConnector,
} from '../../src/services/mcp/mcp-plus-plus-connector';

// ---------------------------------------------------------------------------
// Framing helpers (mirror MCP++ Profile E §5.1)
// ---------------------------------------------------------------------------

function encodeFrame(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const hdr = Buffer.allocUnsafe(4);
  hdr.writeUInt32BE(body.length, 0);
  return Buffer.concat([hdr, body]);
}

/** Text-content CallToolResult envelope, as the servers return for meta-tools. */
function toolResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

type RpcHandler = (method: string, params: any) => any;

/**
 * A bidirectional mock stream that behaves like a remote MCP+p2p server:
 * every complete frame the client writes is decoded, passed to `handler`, and
 * the reply is framed back onto the inbound async-iterator side.
 */
function makeServerStream(handler: RpcHandler): P2PStream {
  let inboundResolve: ((v: IteratorResult<Uint8Array>) => void) | null = null;
  const inboundQueue: Uint8Array[] = [];
  let readBuf = Buffer.alloc(0);

  const pushInbound = (frame: Buffer) => {
    if (inboundResolve) {
      const r = inboundResolve;
      inboundResolve = null;
      r({ value: frame, done: false });
    } else {
      inboundQueue.push(frame);
    }
  };

  const respond = (msg: any) => {
    // Notifications (no id) get no response.
    if (msg.id === undefined || msg.id === null) return;
    // 'initialized' etc. are notifications; requests carry a method.
    if (!('method' in msg)) return;
    let result: any;
    let error: any;
    try {
      result = handler(msg.method, msg.params);
    } catch (e: any) {
      error = { code: -32000, message: e?.message ?? 'handler error' };
    }
    const reply = error
      ? { jsonrpc: '2.0', id: msg.id, error }
      : { jsonrpc: '2.0', id: msg.id, result };
    pushInbound(encodeFrame(reply));
  };

  return {
    write(chunk: Uint8Array): void {
      readBuf = Buffer.concat([readBuf, Buffer.from(chunk)]);
      while (readBuf.length >= 4) {
        const len = readBuf.readUInt32BE(0);
        if (readBuf.length < 4 + len) break;
        const body = readBuf.subarray(4, 4 + len);
        readBuf = readBuf.subarray(4 + len);
        let msg: any;
        try {
          msg = JSON.parse(body.toString('utf8'));
        } catch {
          continue;
        }
        respond(msg);
      }
    },
    close(): void {
      if (inboundResolve) {
        const r = inboundResolve;
        inboundResolve = null;
        r({ value: undefined as unknown as Uint8Array, done: true });
      }
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (inboundQueue.length > 0) {
          yield inboundQueue.shift()!;
          continue;
        }
        const next = await new Promise<IteratorResult<Uint8Array>>(resolve => {
          inboundResolve = resolve;
        });
        if (next.done) return;
        yield next.value;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fake ipfs_kit_py-style MCP++ server handler
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { name: 'core', count: 3 },
  { name: 'storage', count: 5 },
];
const KIT_INTERFACE_CID = 'sha256:kit-interface-descriptor';
const PROFILE_B_TEST_CID = 'bafkreicecnx2gvntm6fbcrvnc336qze6st5u7qq7457igegamd3bzkx7ri';
const KIT_INTERFACE_DESCRIPTOR = {
  name: 'ipfs_kit_py.mcp-tools',
  namespace: 'org.hallucinate.swissknife.mcp.ipfs_kit_py',
  version: '1.0.0',
  interface_cid: KIT_INTERFACE_CID,
  methods: [
    {
      name: 'tools_list_categories',
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      input_schema_cid: 'sha256:in-categories',
      output_schema_cid: 'sha256:out-categories',
      error_schema_cids: [],
      errors: ['MCPError'],
      streaming: false,
    },
    {
      name: 'core.health_check',
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      input_schema_cid: 'sha256:in-health',
      output_schema_cid: 'sha256:out-health',
      error_schema_cids: [],
      errors: ['MCPError'],
      streaming: false,
    },
  ],
  errors: ['MCPError'],
  requires: [],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['mcp', 'mcp-idl'],
  observability: { trace: true, provenance: true },
};

function kitHandler(method: string, params: any): any {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'ipfs-kit-mcp', version: '0.1.0' },
        capabilities: {
          tools: true,
          mcpPlusPlusProfiles: ['mcp++/idl', 'mcp++/cid-envelope', 'mcp++/event-dag', 'mcp++/p2p-transport'],
          experimental: {
            'mcp++/mcp-idl': true,
            'mcp++/cid-envelope': true,
            'mcp++/p2p-transport': true,
          },
        },
      };
    case 'tools/list':
      return {
        tools: [
          { name: 'tools_list_categories' },
          { name: 'tools_list_tools' },
          { name: 'tools_get_schema' },
          { name: 'tools_dispatch' },
          { name: 'core.health_check' },
          { name: 'storage.ipfs_add' },
        ],
      };
    case 'interfaces/list':
      return { interfaces: [KIT_INTERFACE_CID], interface_cids: [KIT_INTERFACE_CID] };
    case 'interfaces/get':
      if (params.interface_cid !== KIT_INTERFACE_CID) throw new Error('unknown interface CID');
      return {
        interface_cid: KIT_INTERFACE_CID,
        descriptor: KIT_INTERFACE_DESCRIPTOR,
        canonical_descriptor: { ...KIT_INTERFACE_DESCRIPTOR, interface_cid: undefined },
        canonical_bytes_base64: 'e30=',
      };
    case 'interfaces/compat':
      return {
        compatible: params.client_cid === KIT_INTERFACE_CID && params.server_cid === KIT_INTERFACE_CID,
        reasons: [],
        requires_missing: [],
        suggested_alternatives: [],
      };
    case 'mcp++/execute':
      if (params.interface_cid !== KIT_INTERFACE_CID) throw new Error('unknown interface CID');
      return {
        output: { executed: params.tool },
        envelope: { interface_cid: params.interface_cid, input_cid: PROFILE_B_TEST_CID, parents: [], timestamp: params.timestamp },
        envelope_cid: PROFILE_B_TEST_CID,
        input_cid: PROFILE_B_TEST_CID,
        intent_cid: PROFILE_B_TEST_CID,
        output_cid: PROFILE_B_TEST_CID,
        event_cid: PROFILE_B_TEST_CID,
        receipt_artifact: { success: true },
        event: { receipt_cid: PROFILE_B_TEST_CID },
        receipt: { success: true, receipt_cid: PROFILE_B_TEST_CID },
      };
    case 'mcp++/artifacts/get':
      return {
        found: true,
        verified: true,
        cid: params.cid,
        backend: 'disk',
        bytes_base64: 'e30=',
      };
    case 'tools/call': {
      const { name, arguments: args } = params;
      if (name === 'tools_list_categories') return toolResult({ categories: CATEGORIES });
      if (name === 'tools_list_tools') {
        return toolResult({ category: args.category, tools: ['health_check', 'version'] });
      }
      if (name === 'tools_get_schema') {
        return toolResult({ name: args.name, inputSchema: { type: 'object' } });
      }
      if (name === 'tools_dispatch') {
        return toolResult({ dispatched: `${args.category}.${args.tool}`, params: args.params });
      }
      if (name === 'core.health_check') return toolResult({ status: 'ok' });
      throw new Error(`unknown tool: ${name}`);
    }
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

async function connectorOverSession(handler: RpcHandler = kitHandler) {
  const stream = makeServerStream(handler);
  const session = new MCPp2pSession(stream);
  await session.handshake({ name: 'swissknife-test', version: '0.0.0' });
  const connector = new MCPPPServerConnector({ ...IPFS_KIT_SERVER, transport: 'libp2p' });
  const result = await connector.useSession(session);
  return { connector, session, result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPPPServerConnector over libp2p (MCP+p2p Profile E)', () => {
  it('binds to a live MCP+p2p session and negotiates profiles', async () => {
    const { result, session } = await connectorOverSession();
    expect(result.success).toBe(true);
    expect(result.profiles).toContain('mcp++/p2p-transport');
    await session.close();
  });

  it('discovers tools via JSON-RPC tools/list over the session', async () => {
    const { result, session } = await connectorOverSession();
    expect(result.tools).toContain('tools_list_categories');
    expect(result.tools).toContain('core.health_check');
    expect(result.tools.length).toBe(6);
    await session.close();
  });

  it('discovers, fetches, and checks a Profile A descriptor over libp2p', async () => {
    const { connector, session, result } = await connectorOverSession();
    expect(result.profiles).toContain('mcp++/idl');
    const interfaces = await connector.listInterfaces();
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0].interface_cid).toBe(KIT_INTERFACE_CID);
    expect(interfaces[0].methods.map(method => method.name)).toContain('core.health_check');
    const fetched = await connector.getInterface(KIT_INTERFACE_CID);
    expect(fetched?.name).toBe('ipfs_kit_py.mcp-tools');
    await expect(connector.checkInterfaceCompatibility(KIT_INTERFACE_CID)).resolves.toMatchObject({ compatible: true });
    await session.close();
  });

  it('executes a Profile B envelope over libp2p', async () => {
    const { connector, session, result } = await connectorOverSession();
    expect(result.profiles).toContain('mcp++/cid-envelope');
    const execution = await connector.callToolWithEnvelope('core.health_check', {}, {
      interfaceCid: KIT_INTERFACE_CID,
      timestamp: '2026-07-10T00:00:00.000Z',
      correlationId: 'connector-libp2p-profile-b',
    });
    expect(execution.result).toEqual({ executed: 'core.health_check' });
    expect(execution.envelope).toMatchObject({ envelope_cid: PROFILE_B_TEST_CID, receipt: { success: true } });
    await expect(connector.getArtifact(PROFILE_B_TEST_CID)).resolves.toMatchObject({
      found: true,
      verified: true,
      cid: PROFILE_B_TEST_CID,
      backend: 'disk',
    });
    await session.close();
  });

  it('lists hierarchical categories through the tools_list_categories meta-tool', async () => {
    const { connector, session } = await connectorOverSession();
    const cats = await connector.listCategories(true);
    expect(cats.categories).toEqual(CATEGORIES);
    await session.close();
  });

  it('lists tools in a category and unwraps the CallToolResult envelope', async () => {
    const { connector, session } = await connectorOverSession();
    const listed = await connector.listToolsInCategory('core');
    expect(listed.category).toBe('core');
    expect(listed.tools).toEqual(['health_check', 'version']);
    await session.close();
  });

  it('dispatches a tool inside a category over libp2p', async () => {
    const { connector, session } = await connectorOverSession();
    const out = await connector.dispatch('storage', 'ipfs_add', { path: '/tmp/x' });
    expect(out.dispatched).toBe('storage.ipfs_add');
    expect(out.params).toEqual({ path: '/tmp/x' });
    await session.close();
  });

  it('calls a flat tool by dotted name over libp2p', async () => {
    const { connector, session } = await connectorOverSession();
    const health = await connector.callTool('core.health_check', {});
    // callTool returns the raw CallToolResult; the text payload is the health JSON.
    expect(health.content[0].text).toContain('"status":"ok"');
    await session.close();
  });

  it('surfaces JSON-RPC errors from the server as thrown errors', async () => {
    const { connector, session } = await connectorOverSession();
    await expect(connector.callTool('does.not.exist', {})).rejects.toThrow(/unknown tool/);
    await session.close();
  });
});

describe('createMultiServerConnector libp2p wiring', () => {
  it('includes the ipfs_kit_py server by default', () => {
    const multi = createMultiServerConnector('did:key:zTest');
    expect(multi.getConnector(IPFS_KIT_SERVER.name)).toBeDefined();
  });

  it('applies a single libp2p multiaddr to every server', () => {
    const addr = '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooTest';
    const multi = createMultiServerConnector('did:key:zTest', { libp2p: addr });
    const kit = multi.getConnector(IPFS_KIT_SERVER.name)!;
    expect(kit.endpoint).toBe(addr);
    expect(kit.transportKind).toBe('libp2p');
  });

  it('applies per-server libp2p multiaddrs', () => {
    const multi = createMultiServerConnector('did:key:zTest', {
      libp2p: { [IPFS_KIT_SERVER.name]: '/ip4/10.0.0.1/tcp/5001/p2p/kit' },
    });
    expect(multi.getConnector(IPFS_KIT_SERVER.name)!.transportKind).toBe('libp2p');
    // datasets/accelerate keep their HTTP default when no addr is provided.
    expect(multi.getConnector('ipfs-datasets-mcp++')!.transportKind).toBe('http');
  });
});
