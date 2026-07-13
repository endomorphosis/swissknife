import { describe, expect, it, vi } from 'vitest';

import {
  MCPPlusPlusDesktopClient,
} from '../../web/js/core/mcp-plus-plus-desktop-client.js';

const services = [{
  id: 'test_service',
  label: 'Test Service',
  baseUrl: 'http://127.0.0.1:9999',
  mcpPath: '/mcp',
  healthPath: '/mcp/health',
}];

describe('MCP++ virtual desktop browser client', () => {
  it('collects protocol diagnostics and exposes live supervisor health', async () => {
    const fetch = vi.fn(async (url: string, options: RequestInit = {}) => responseFor(url, options));
    const client = new MCPPlusPlusDesktopClient({ fetch, services, timeoutMs: 50 });

    const snapshot = await client.inspectService('test_service');
    const gateway = client.createSupervisorGateway();
    const health = await gateway.invoke({
      capability_id: 'supervisor.health.read',
      owner: 'ipfs_accelerate_py',
      correlation_id: 'desktop-client-test',
    });

    expect(snapshot).toMatchObject({
      service: 'test_service',
      available: true,
      toolCount: 1,
      profiles: expect.arrayContaining(['mcp++/event-dag', 'mcp++/p2p-transport']),
      frontier: ['bafyfrontier'],
      peers: [{ id: 'peer-a' }],
      helia: { enabled: true, connection_count: 1 },
    });
    expect(health).toMatchObject({
      state: 'available',
      correlation_id: 'desktop-client-test',
      data: {
        status: 'available',
        backends: [{ owner: 'test_service', tool_count: 1 }],
      },
    });
    expect(fetch).toHaveBeenCalled();
  });

  it('sends explicit tool calls through tools/call', async () => {
    const fetch = vi.fn(async (url: string, options: RequestInit = {}) => responseFor(url, options));
    const client = new MCPPlusPlusDesktopClient({ fetch, services, timeoutMs: 50 });

    const result = await client.callTool('test_service', 'status', { verbose: true });

    expect(result).toEqual({ content: [{ type: 'text', text: '{"ok":true}' }] });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      method: 'tools/call',
      params: { name: 'status', arguments: { verbose: true } },
    });
  });

  it('exposes the normative Profile A-F operations through JSON-RPC', async () => {
    const fetch = vi.fn(async (url: string, options: RequestInit = {}) => responseFor(url, options));
    const client = new MCPPlusPlusDesktopClient({ fetch, services, timeoutMs: 50 });

    await client.getInterface('test_service', 'bafyinterface');
    await client.executeEnvelope('test_service', { interface_cid: 'bafyinterface', tool: 'status', arguments: {} });
    await client.delegateCapability('test_service', { audience: 'did:key:zTest', capabilities: [] });
    await client.validateDelegation('test_service', { proof_cid: 'bafyproof' });
    await client.revokeDelegation('test_service', 'bafyproof');
    await client.discoverPeers('test_service');
    await client.appendDagEvent('test_service', { event_type: 'invocation', parents: [], payload: {} });
    await client.getDagProvenance('test_service', 'bafyevent');
    await client.archiveDag('test_service', { max_events: 1 });
    await client.getDagCertificate('test_service', 'bafycertificate');
    await client.verifyDagCertificate('test_service', 'bafycertificate');
    await client.getDagInclusion('test_service', 'bafyevent');

    expect(fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).method)).toEqual([
      'interfaces/get',
      'mcp++/execute',
      'mcp++/ucan/delegate',
      'mcp++/ucan/validate',
      'mcp++/ucan/revoke',
      'mcp++/p2p/peers',
      'mcp++/dag/append',
      'mcp++/dag/provenance',
      'mcp++/dag/archive',
      'mcp++/dag/certificate/get',
      'mcp++/dag/certificate/verify',
      'mcp++/dag/inclusion',
    ]);
  });
});

function responseFor(url: string, options: RequestInit): Response {
  if (url.endsWith('/mcp/health')) return json({ status: 'ok' });
  if (url.endsWith('/mcp/helia/status')) return json({
    enabled: true,
    dht_mode: 'client',
    connection_count: 1,
    connection_limit: 4,
  });
  const request = JSON.parse(String(options.body || '{}'));
  const results: Record<string, unknown> = {
    initialize: {
      protocolVersion: '2024-11-05',
      capabilities: { experimental: { 'mcp++/event-dag': true, 'mcp++/p2p-transport': true } },
    },
    'tools/list': { tools: [{ name: 'status', description: 'Inspect status', inputSchema: { type: 'object' } }] },
    'interfaces/list': { interfaces: [{ interface_cid: 'bafyinterface' }] },
    'mcp++/dag/frontier': { frontier: ['bafyfrontier'] },
    'mcp++/dag/archives': { archives: [] },
    'mcp++/p2p/peers': { peers: [{ id: 'peer-a' }] },
    'tools/call': { content: [{ type: 'text', text: '{"ok":true}' }] },
  };
  return json({ jsonrpc: '2.0', id: request.id, result: results[request.method] ?? {} });
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
