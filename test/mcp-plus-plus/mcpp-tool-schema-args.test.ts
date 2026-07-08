/**
 * MCP++ hierarchical `tools_get_schema` argument-shape tests.
 *
 * The datasets/kit/accelerate servers expose `tools_get_schema(category, tool)`
 * — two required positional args, split from a flat `<category>.<tool>` name on
 * the FIRST dot (Python `str.partition(".")`). SwissKnife's connector used to
 * send `{ name }`, which the server rejects. These tests lock in the corrected
 * `{ category, tool }` wire shape.
 */

import { describe, it, expect } from '@jest/globals';
import {
  MCPPPServerConnector,
  splitDottedToolName,
  type MCPPPServerConfig,
} from '../../src/services/mcp/mcp-plus-plus-connector';

describe('splitDottedToolName', () => {
  it('splits on the first dot (matches server str.partition("."))', () => {
    expect(splitDottedToolName('core.health_check')).toEqual({
      category: 'core',
      tool: 'health_check',
    });
  });

  it('keeps everything after the first dot as the tool name', () => {
    expect(splitDottedToolName('data.load.csv')).toEqual({
      category: 'data',
      tool: 'load.csv',
    });
  });

  it('falls back to { name } for a bare (dot-less) name', () => {
    expect(splitDottedToolName('health_check')).toEqual({ name: 'health_check' });
  });

  it('falls back to { name } for malformed edge cases (leading/trailing dot)', () => {
    expect(splitDottedToolName('.foo')).toEqual({ name: '.foo' });
    expect(splitDottedToolName('foo.')).toEqual({ name: 'foo.' });
  });
});

describe('MCPPPServerConnector.getToolSchema wire shape', () => {
  // A connector whose callTool is spied so we can assert the exact args sent to
  // the server's tools_get_schema meta-tool.
  function makeConnector(): { connector: MCPPPServerConnector; calls: any[] } {
    const cfg: MCPPPServerConfig = {
      name: 'ipfs-datasets',
      transport: 'http',
      baseUrl: 'http://127.0.0.1:3002',
      mcpPath: '/mcp',
      toolsPath: '/mcp/tools/list',
      healthPath: '/mcp/tools/list',
    };
    const connector = new MCPPPServerConnector(cfg);
    const calls: any[] = [];
    // Stub callTool to capture args and return a CallToolResult envelope so
    // unwrapToolResult yields plain data.
    (connector as any).callTool = async (name: string, args: any) => {
      calls.push({ name, args });
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, echoed: args }) }] };
    };
    return { connector, calls };
  }

  it('splits a dotted string into { category, tool } (not { name })', async () => {
    const { connector, calls } = makeConnector();
    await connector.getToolSchema('core.health_check');
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('tools_get_schema');
    expect(calls[0].args).toEqual({ category: 'core', tool: 'health_check' });
    expect(calls[0].args).not.toHaveProperty('name');
  });

  it('passes an explicit { category, tool } param object through unchanged', async () => {
    const { connector, calls } = makeConnector();
    await connector.getToolSchema({ category: 'storage', tool: 'ipfs_add' });
    expect(calls[0].args).toEqual({ category: 'storage', tool: 'ipfs_add' });
  });

  it('unwraps the CallToolResult envelope to plain data', async () => {
    const { connector } = makeConnector();
    const out = await connector.getToolSchema('core.health_check');
    expect(out).toEqual({ ok: true, echoed: { category: 'core', tool: 'health_check' } });
  });
});
