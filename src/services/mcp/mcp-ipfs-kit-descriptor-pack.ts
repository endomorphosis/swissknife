/**
 * ipfs_kit_py MCP++ descriptor pack.
 *
 * Single-source: tool defs come from the generated tools-manifest.json emitted
 * by `python -m ipfs_kit_py.mcp_server.js_sdk.generate`, so the dashboard never
 * hand-maintains a parallel tool list. Each manifest tool becomes a backend
 * binding the dashboard can render and call over MCP/MCP++.
 */
import manifest from '../mcp-ipfs-kit-tools-manifest.json';

export interface IPFSKitToolDef {
  name: string;
  category: string;
  description: string;
  tags?: string[];
  deprecated?: boolean;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
}

export interface IPFSKitManifest {
  version: string;
  tools: IPFSKitToolDef[];
}

export interface IPFSKitBackendBinding {
  category: string;
  tool_function: string;
  description: string;
  read_only: boolean;
  inputSchema: IPFSKitToolDef['inputSchema'];
}

export interface IPFSKitDescriptorPack {
  id: string;
  version: string;
  source_repository: string;
  required_categories: string[];
  backend_bindings: IPFSKitBackendBinding[];
}

const m = manifest as IPFSKitManifest;

export function getIPFSKitDescriptorPack(): IPFSKitDescriptorPack {
  return {
    id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
    version: m.version,
    source_repository: 'ipfs_kit_py',
    required_categories: Array.from(new Set(m.tools.map(t => t.category))),
    backend_bindings: m.tools.map(t => ({
      category: t.category,
      tool_function: t.name,
      description: t.description,
      read_only: (t.tags ?? []).includes('read'),
      inputSchema: t.inputSchema,
    })),
  };
}

export const ipfsKitDescriptorPack = getIPFSKitDescriptorPack();

export function validateIPFSKitDescriptorPack(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const b of ipfsKitDescriptorPack.backend_bindings) {
    if (!b.tool_function) errors.push('binding missing tool_function');
    if (!b.inputSchema || b.inputSchema.type !== 'object') errors.push(`${b.tool_function}: bad schema`);
  }
  return { valid: errors.length === 0, errors };
}

export const IPFS_KIT_REQUIRED_CATEGORIES = ipfsKitDescriptorPack.required_categories;

/** MCP++ profiles the ipfs_kit_py server conforms to (A: IDL, B: receipts, E: DAG). */
export const IPFS_KIT_MCPPP_PROFILES = {
  A_interface_descriptors: true,
  B_cid_envelopes: true,
  C_ucan_unsigned: true,
  D_policy: true,
  E_dag_events: true,
} as const;

/** JSON-RPC methods the dashboard can drive against the kit server. */
export const IPFS_KIT_MCPPP_METHODS = {
  interfaces: 'mcp++/interfaces',
  ucanValidate: 'mcp++/ucan/validate',
  ucanDelegate: 'mcp++/ucan/delegate',
  policyEvaluate: 'mcp++/policy/evaluate',
  dagFrontier: 'mcp++/dag/frontier',
} as const;

/** Profile A: derive canonical interface descriptors from the manifest. */
export function getIPFSKitInterfaceDescriptors() {
  return m.tools.map(t => ({
    namespace: `ipfs_kit/${t.category}`,
    name: t.name,
    input_schema: t.inputSchema,
    output_schema: { type: 'object' },
    errors: ['IPFSError', 'ToolNotFound'],
    semantic_tags: t.tags ?? [],
    compatibility: { mcp: true, 'mcp++': true },
  }));
}
