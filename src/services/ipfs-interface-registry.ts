export interface IPFSInterfaceDescriptor {
  name: string;
  methods: Array<{ name: string; endpoint: string }>;
}

export const IPFS_INTERFACE_REGISTRY: IPFSInterfaceDescriptor[] = [];

export function registerIPFSInterface(descriptor: IPFSInterfaceDescriptor) {
  IPFS_INTERFACE_REGISTRY.push(descriptor);
  return descriptor;
}
