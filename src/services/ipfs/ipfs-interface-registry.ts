/**
 * IPFS Interface Registry Registration
 * 
 * Publishes IPFS IDL descriptors into the InterfaceRepository and registers
 * the full UI profiles with the MCPCapabilityRouter for discovery/bind/invoke.
 * Also registers Meta Glasses widget descriptors for AR display compilation.
 * 
 * Call `registerIPFSInterfaces()` during SwissKnife initialization to make
 * all IPFS operations discoverable through the ORB lifecycle.
 */

import { InterfaceRepository, computeInterfaceCID } from '../mcp-idl.js';
import { ipfsKitDescriptor, ipfsDatasetsDescriptor, ipfsAccelerateDescriptor } from './ipfs-idl-descriptors.js';
import { ipfsKitUIProfile, ipfsDatasetsUIProfile, ipfsAccelerateUIProfile } from './ipfs-ui-profiles.js';
import { ipfsKitGlassesWidget, ipfsDatasetsGlassesWidget, ipfsAccelerateGlassesWidget } from '../ipfs-glasses-widgets.js';
import type { MCPUIProfileDescriptor } from '../mcp-ui-profile.js';

export interface IPFSRegistrationResult {
  descriptors: Array<{ name: string; cid: string }>;
  profiles: MCPUIProfileDescriptor[];
  glasses_widgets: number;
}

/**
 * Register all IPFS interfaces in the repository for ORB discovery.
 * Returns computed CIDs and registered profiles.
 */
export async function registerIPFSInterfaces(
  repository: InterfaceRepository,
): Promise<IPFSRegistrationResult> {
  const descriptors = [ipfsKitDescriptor, ipfsDatasetsDescriptor, ipfsAccelerateDescriptor];
  const registeredCIDs: Array<{ name: string; cid: string }> = [];

  for (const desc of descriptors) {
    const cid = computeInterfaceCID(desc);
    repository.publish(desc);
    registeredCIDs.push({ name: desc.name, cid });
  }

  return {
    descriptors: registeredCIDs,
    profiles: [ipfsKitUIProfile, ipfsDatasetsUIProfile, ipfsAccelerateUIProfile],
    glasses_widgets: 3,
  };
}

/**
 * Resolve the best UI template for an IPFS interface based on its descriptor.
 * Uses the template contracts from mcp-ui-profile.ts to match.
 */
export function resolveIPFSTemplate(profileName: 'ipfs-kit' | 'ipfs-datasets' | 'ipfs-accelerate') {
  const map = {
    'ipfs-kit': { template: 'explorer', profile: ipfsKitUIProfile },
    'ipfs-datasets': { template: 'dashboard', profile: ipfsDatasetsUIProfile },
    'ipfs-accelerate': { template: 'job-console', profile: ipfsAccelerateUIProfile },
  };
  return map[profileName];
}

/**
 * Get glasses widget for a given IPFS service
 */
export function getIPFSGlassesWidget(profileName: 'ipfs-kit' | 'ipfs-datasets' | 'ipfs-accelerate') {
  const map = {
    'ipfs-kit': ipfsKitGlassesWidget,
    'ipfs-datasets': ipfsDatasetsGlassesWidget,
    'ipfs-accelerate': ipfsAccelerateGlassesWidget,
  };
  return map[profileName];
}

/**
 * Generate a schema-driven UI specification from an IPFS profile.
 * This returns the data needed for the hallucinate app's SchemaDrivenUIRenderer.
 */
export function generateIPFSSchemaUI(profileName: 'ipfs-kit' | 'ipfs-datasets' | 'ipfs-accelerate') {
  const { profile } = resolveIPFSTemplate(profileName);
  return {
    meta: profile.meta,
    methods: profile.methods,
    data_contracts: profile.data_contracts,
    ui: profile.ui,
    state_model: profile.state_model,
    workflow_graph: profile.workflow_graph,
  };
}

export default registerIPFSInterfaces;
