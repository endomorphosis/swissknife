export const IPFS_INTERFACE_REGISTRY = [
  {
    id: 'ipfs-kit',
    appId: 'ipfs-explorer',
    methods: ['add', 'cat', 'pin', 'list_pins', 'stat', 'capabilities'],
  },
  {
    id: 'ipfs-datasets',
    appId: 'datasets-browser',
    methods: ['list_datasets', 'search_semantic', 'vector_index', 'vector_search'],
  },
  {
    id: 'ipfs-accelerate',
    appId: 'accelerate-panel',
    methods: ['list_models', 'generate', 'inference', 'metrics'],
  },
] as const;

export function getIPFSInterface(id: string) {
  return IPFS_INTERFACE_REGISTRY.find((entry) => entry.id === id);
}
