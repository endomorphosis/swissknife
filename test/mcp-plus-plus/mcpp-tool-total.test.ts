/**
 * MCP++ hierarchical tool-count tests.
 *
 * The kit/datasets/accelerate MCP servers expose a hierarchical facade: every
 * `tools/list` returns four plumbing meta-tools (tools_list_categories /
 * tools_list_tools / tools_get_schema / tools_dispatch) plus a flat
 * `<category>.<tool>` surface. Flat-counting the raw list both over-counts (the
 * 4 meta-tools) and under-counts reduced servers (whose real total lives behind
 * `tools_list_categories`). These tests lock in the corrected counting used by
 * the `mcp++ connect` command output.
 */

import { describe, it, expect } from '@jest/globals';
import {
  MCPPP_META_TOOL_NAMES,
  domainToolNames,
  mcpppToolTotal,
} from '../../src/services/mcp/mcp-plus-plus-connector';

const META = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];

describe('MCPPP_META_TOOL_NAMES', () => {
  it('is exactly the four hierarchical facade meta-tools', () => {
    expect([...MCPPP_META_TOOL_NAMES].sort()).toEqual([...META].sort());
  });
});

describe('domainToolNames', () => {
  it('drops the meta-tools and keeps the flat domain tools', () => {
    const names = [...META, 'core.health_check', 'storage.ipfs_add'];
    expect(domainToolNames(names)).toEqual(['core.health_check', 'storage.ipfs_add']);
  });

  it('is null/undefined safe and skips non-strings', () => {
    expect(domainToolNames(null)).toEqual([]);
    expect(domainToolNames(undefined)).toEqual([]);
    expect(domainToolNames([null as any, 1 as any, 'core.x'])).toEqual(['core.x']);
  });
});

describe('mcpppToolTotal', () => {
  it('full-flat surface: counts domain tools only, excluding the 4 meta-tools', async () => {
    const names = [...META, 'core.health_check', 'storage.ipfs_add'];
    // 6 raw names -> 2 real domain tools; no connector call needed.
    expect(await mcpppToolTotal(names)).toBe(2);
  });

  it('full-flat surface never consults the connector for categories', async () => {
    const names = [...META, 'core.health_check', 'storage.ipfs_add'];
    let called = false;
    const connector = {
      async listCategories() {
        called = true;
        return { categories: [{ name: 'core', count: 999 }] };
      },
    };
    expect(await mcpppToolTotal(names, connector)).toBe(2);
    expect(called).toBe(false);
  });

  it('reduced facade (meta-only): sums per-category counts via the connector', async () => {
    const connector = {
      async listCategories() {
        return { categories: [{ name: 'core', count: 3 }, { name: 'storage', count: 5 }] };
      },
    };
    expect(await mcpppToolTotal(META, connector)).toBe(8);
  });

  it('reduced facade: accepts a bare category array (no wrapper object)', async () => {
    const connector = {
      async listCategories() {
        return [{ name: 'a', count: 10 }, { name: 'b', tool_count: 7 }];
      },
    };
    expect(await mcpppToolTotal(META, connector)).toBe(17);
  });

  it('reduced facade without a connector falls back to the raw name count', async () => {
    expect(await mcpppToolTotal(META)).toBe(4);
  });

  it('reduced facade falls back to the raw count when listCategories throws', async () => {
    const connector = {
      async listCategories(): Promise<any> {
        throw new Error('server unavailable');
      },
    };
    expect(await mcpppToolTotal(META, connector)).toBe(4);
  });

  it('reduced facade falls back to the raw count when categories carry no counts', async () => {
    const connector = {
      async listCategories() {
        return { categories: [{ name: 'core' }, { name: 'storage' }] };
      },
    };
    expect(await mcpppToolTotal(META, connector)).toBe(4);
  });

  it('empty / null input is zero', async () => {
    expect(await mcpppToolTotal([])).toBe(0);
    expect(await mcpppToolTotal(null)).toBe(0);
    expect(await mcpppToolTotal(undefined)).toBe(0);
  });

  it('legacy flat server (no meta-tools) counts every tool', async () => {
    expect(await mcpppToolTotal(['add', 'cat', 'pin'])).toBe(3);
  });
});
