import {
  IPFS_KIT_REQUIRED_CATEGORIES,
  getIPFSKitDescriptorPack,
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
});
