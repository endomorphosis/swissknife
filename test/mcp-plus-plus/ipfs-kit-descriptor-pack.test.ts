import {
  IPFS_KIT_REQUIRED_CATEGORIES,
  IPFS_KIT_MCPPP_PROFILES,
  IPFS_KIT_MCPPP_METHODS,
  getIPFSKitDescriptorPack,
  getIPFSKitInterfaceDescriptors,
  ipfsKitDescriptorPack,
  validateIPFSKitDescriptorPack,
} from '../../src/services/mcp-ipfs-kit-descriptor-pack';

describe('ipfs_kit_py descriptor pack', () => {
  it('validates offline against the generated manifest', () => {
    const result = validateIPFSKitDescriptorPack();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('exposes the canonical ipfs_kit tool categories', () => {
    for (const cat of ['ipfs_tools', 'pin_tools', 'dag_tools', 'mfs_tools', 'swarm_tools', 'name_tools', 'car_tools', 'cluster_tools']) {
      expect(IPFS_KIT_REQUIRED_CATEGORIES).toContain(cat);
    }
  });

  it('binds key tools dashboard depends on', () => {
    const fns = new Set(ipfsKitDescriptorPack.backend_bindings.map(b => b.tool_function));
    for (const fn of ['ipfs_add', 'ipfs_cat', 'pin_add', 'get_pinset', 'dag_put', 'files_ls', 'name_publish', 'create_car']) {
      expect(fns.has(fn)).toBe(true);
    }
  });

  it('mirrors python tool count (21)', () => {
    expect(getIPFSKitDescriptorPack().backend_bindings.length).toBe(21);
  });

  it('declares MCP++ profiles A/B/E', () => {
    expect(IPFS_KIT_MCPPP_PROFILES.A_interface_descriptors).toBe(true);
    expect(IPFS_KIT_MCPPP_PROFILES.B_cid_envelopes).toBe(true);
    expect(IPFS_KIT_MCPPP_PROFILES.E_dag_events).toBe(true);
  });

  it('declares MCP++ profiles C/D and exposes their methods', () => {
    expect(IPFS_KIT_MCPPP_PROFILES.C_ucan_unsigned).toBe(true);
    expect(IPFS_KIT_MCPPP_PROFILES.D_policy).toBe(true);
    expect(IPFS_KIT_MCPPP_METHODS.ucanValidate).toBe('mcp++/ucan/validate');
    expect(IPFS_KIT_MCPPP_METHODS.policyEvaluate).toBe('mcp++/policy/evaluate');
  });

  it('Profile A: interface descriptors mirror every tool with mcp++ compatibility', () => {
    const ifaces = getIPFSKitInterfaceDescriptors();
    expect(ifaces.length).toBe(21);
    for (const d of ifaces) {
      expect(d.namespace.startsWith('ipfs_kit/')).toBe(true);
      expect(d.compatibility['mcp++']).toBe(true);
    }
  });
});
