/**
 * Implements a knowledge graph system based on IPLD (InterPlanetary Linked Data).
 * Allows creating, linking, and querying nodes stored in an IPLD DAG.
 * Based on the integration plan.
 */

import { VirtualFilesystem } from '../storage/virtual-filesystem.js';

// Minimal typed interfaces for IPFS client and CID (avoids hard dep on ipfs-http-client)
interface IPFSDagClient {
  put(node: unknown, opts?: { storeCodec?: string; hashAlg?: string }): Promise<{ toString(): string }>;
  get(cid: { toString(): string }, opts?: unknown): Promise<unknown>;
}
interface IPFSClientLike { dag: IPFSDagClient; isOnline?(): boolean }

// CID is represented as a string throughout this implementation
type CIDString = string;

/** Represents a node within the IPLD knowledge graph. */
export interface IPLDNode {
  // Using a standard property name like '@id' or 'id' is common
  id: string; // Unique identifier for the node (e.g., UUID, DID)
  type?: string; // Optional node type (e.g., 'Person', 'Document', 'Concept')
  data: any; // The actual data payload of the node
  // Links represent edges in the graph. The target is identified by its CID.
  links?: Array<{
    name: string; // The relationship name (e.g., 'mentions', 'authoredBy', 'relatedTo')
    cid: string; // The CID string of the target node
    // Optional: Add relation properties if needed
    // relationProperties?: Record<string, any>;
  }>;
  // Optional: Timestamps, versioning info, etc.
  createdAt?: string;
  updatedAt?: string;
}

/** Options for configuring the IPLD Knowledge Graph. */
export interface KnowledgeGraphOptions {
  ipfsOptions?: any; // Options for connecting to IPFS (e.g., URL, API port)
  persistenceOptions?: {
    enabled: boolean; // Whether to persist graph state (e.g., root CID)
    storageBackendId?: string; // ID of the VFS backend to use for persistence
    rootPath?: string; // Path within the backend to store the root CID
  };
  // Add other options like default IPLD codec if needed
}

/**
 * Manages an IPLD-based knowledge graph, interacting with IPFS.
 */
export class IPLDKnowledgeGraph {
  private readonly ipfs: IPFSClientLike;
  private rootCID: CIDString | null = null;
  private readonly nodeCache = new Map<string, IPLDNode>();
  private readonly storage: VirtualFilesystem | null;
  private readonly persistenceOptions: KnowledgeGraphOptions['persistenceOptions'];

  constructor(options: KnowledgeGraphOptions, vfs?: VirtualFilesystem) {
    // Use injected IPFS client or fall back to an in-memory stub
    const injected = (options.ipfsOptions as Record<string, unknown>)?.['client'] as IPFSClientLike | undefined;
    this.ipfs = injected ?? {
      dag: {
        put: async (node: unknown, _opts?: unknown) => {
          const cid = `ipld-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
          this.nodeCache.set(cid, node as IPLDNode);
          return { toString: () => cid };
        },
        get: async (cid: { toString(): string }) => this.nodeCache.get(cid.toString()) ?? null,
      },
      isOnline: () => false,
    };
    console.log('IPLDKnowledgeGraph initialized.');
    this.storage = vfs ?? null;
    this.persistenceOptions = options.persistenceOptions;
    if (this.persistenceOptions?.enabled && !this.storage) {
      console.warn('IPLD KG: Persistence enabled but no VirtualFilesystem provided.');
      this.persistenceOptions.enabled = false;
    }
  }

  async initialize(): Promise<void> {
    console.log('Initializing IPLD Knowledge Graph...');
    // Check connectivity if supported by the client
    if (typeof this.ipfs.isOnline === 'function' && this.ipfs.isOnline()) {
      console.log('IPLD KG: IPFS node is online.');
    }
    if (this.persistenceOptions?.enabled && this.storage) {
      await this.loadRootCID();
    }
    console.log(`IPLD Knowledge Graph initialized. Root CID: ${this.rootCID ?? 'None'}`);
  }

  /**
   * Adds a new node to the knowledge graph (stores it in IPFS).
   * @param {any} data - The data payload for the node.
   * @param {string} [type] - Optional type for the node.
   * @param {string} [nodeId] - Optional pre-defined ID for the node (e.g., DID).
   * @returns {Promise<string>} The CID string of the newly created IPLD node.
   */
  async addNode(data: any, type?: string, nodeId?: string): Promise<string> {
    if (!this.ipfs) throw new Error('IPFS client not initialized.');

    const newNode: IPLDNode = {
      // Use crypto.randomUUID() for robust UUID-based node IDs
      id:        nodeId ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                   ? `urn:uuid:${crypto.randomUUID()}`
                   : `urn:uuid:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
      type:      type,
      data:      data,
      links:     [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log(`Adding node ${newNode.id} to IPLD…`);
    // Use dag-cbor codec when the client supports it (no-op option otherwise)
    const cid = await this.ipfs.dag.put(newNode, { storeCodec: 'dag-cbor', hashAlg: 'sha2-256' });

    const cidString = cid.toString();
    this.nodeCache.set(cidString, newNode); // Cache the newly added node
    console.log(`Node ${newNode.id} added with CID: ${cidString}`);

    // Optional: Update root CID if this is the first node or based on specific logic
    // if (!this.rootCID) {
    //   await this.setRootCID(cid);
    // }

    return cidString;
  }

  /**
   * Retrieves a node from the knowledge graph using its CID. Uses cache first.
   * @param {string | CID} cidInput - The CID (string or CID object) of the node to retrieve.
   * @returns {Promise<IPLDNode | null>} The retrieved node or null if not found.
   */
  async getNode(cidInput: string): Promise<IPLDNode | null> {
    const cidString = cidInput;
    if (this.nodeCache.has(cidString)) return this.nodeCache.get(cidString)!;
    try {
      const node = await this.ipfs.dag.get({ toString: () => cidString });
      if (node) { this.nodeCache.set(cidString, node as IPLDNode); return node as IPLDNode; }
      return null;
    } catch { return null; }
  }

  /**
   * Adds a directed link (relationship) between two nodes.
   * This creates a *new version* of the source node with the added link.
   * @param {string | CID} sourceCIDInput - The CID of the source node.
   * @param {string | CID} targetCIDInput - The CID of the target node.
   * @param {string} linkName - The name of the relationship (e.g., 'knows', 'mentions').
   * @returns {Promise<string | null>} The CID string of the *new* source node version, or null if failed.
   */
  async addLink(sourceCIDInput: string | CID, targetCIDInput: string | CID, linkName: string): Promise<string | null> {
     if (!this.ipfs) throw new Error('IPFS client not initialized.');

     const sourceCIDString = typeof sourceCIDInput === 'string' ? sourceCIDInput : sourceCIDInput.toString();
     const targetCIDString = typeof targetCIDInput === 'string' ? targetCIDInput : targetCIDInput.toString();

     console.log(`Adding link '${linkName}' from ${sourceCIDString} to ${targetCIDString}`);

     // 1. Get the current source node
     const sourceNode = await this.getNode(sourceCIDString);
     if (!sourceNode) {
       console.error(`Cannot add link: Source node ${sourceCIDString} not found.`);
       return null;
     }

     // 2. Create a mutable copy or modify directly if safe
     const updatedNode: IPLDNode = {
        ...sourceNode,
        links: [...(sourceNode.links || [])], // Ensure links array exists
        updatedAt: new Date().toISOString(),
     };

     // 3. Add the new link (avoid duplicates?)
     const linkExists = updatedNode.links!.some(link => link.name === linkName && link.cid === targetCIDString);
     if (linkExists) {
        console.warn(`Link '${linkName}' from ${sourceCIDString} to ${targetCIDString} already exists. Not adding duplicate.`);
        // Return the original CID as no change was made? Or the new one if we still put? Let's return original.
        return sourceCIDString;
     }
     updatedNode.links!.push({
       name: linkName,
       cid: targetCIDString,
     });

     // 4. Store the updated node in IPFS, getting a new CID
     console.log(`Storing updated version of node ${sourceNode.id} (Old CID: ${sourceCIDString})`);
     // const newCID = await this.ipfs.dag.put(updatedNode, { storeCodec: 'dag-cbor', hashAlg: 'sha2-256' });
     const newCID = await this.ipfs.dag.put(updatedNode); // Using placeholder client
     const newCIDString = newCID.toString();

     // 5. Update cache with the new version
     this.nodeCache.set(newCIDString, updatedNode);
     // Optional: Remove old CID from cache? Or keep both? Keeping both might be safer.
     // this.nodeCache.delete(sourceCIDString);

     console.log(`Link added. New CID for source node ${sourceNode.id}: ${newCIDString}`);

     // Optional: If the source node was the root, update the root CID
     // if (this.rootCID?.toString() === sourceCIDString) {
     //    await this.setRootCID(newCID);
     // }

     return newCIDString;
  }

  /**
   * Queries the graph by traversing links starting from a given node CID.
   * (Simple traversal example, more complex queries might need dedicated query engine).
   * @param {string | CID} startCIDInput - The CID of the starting node.
   * @param {string[]} linkPath - An array of link names representing the path to traverse (e.g., ['authoredBy', 'friendOf']).
   * @returns {Promise<IPLDNode[]>} A list of nodes found at the end of the traversal path.
   */
  async query(startCIDInput: string | CID, linkPath: string[]): Promise<IPLDNode[]> {
    if (!this.ipfs) throw new Error('IPFS client not initialized.');
    const startCIDString = typeof startCIDInput === 'string' ? startCIDInput : startCIDInput.toString();

    console.log(`Querying graph from ${startCIDString} via path: ${linkPath.join(' -> ')}`);

    let currentNodes: Array<IPLDNode | null> = [await this.getNode(startCIDString)];
    if (!currentNodes[0]) {
      console.warn(`Query start node ${startCIDString} not found.`);
      return [];
    }

    for (let i = 0; i < linkPath.length; i++) {
      const linkName = linkPath[i];
      const nextNodeCIDs = new Set<string>();

      for (const node of currentNodes) {
        if (node?.links) {
          node.links.forEach(link => {
            if (link.name === linkName) {
              nextNodeCIDs.add(link.cid);
            }
          });
        }
      }

      if (nextNodeCIDs.size === 0) {
        console.log(`Traversal stopped at step ${i + 1} ('${linkName}'): No matching links found.`);
        return []; // Path broken
      }

      // Fetch the next set of nodes
      currentNodes = await Promise.all(Array.from(nextNodeCIDs).map(cid => this.getNode(cid)));
      currentNodes = currentNodes.filter(node => node !== null); // Filter out any nodes not found

      if (currentNodes.length === 0) {
         console.log(`Traversal stopped at step ${i + 1} ('${linkName}'): Target nodes not found.`);
         return []; // All target nodes were missing
      }
       console.log(`Traversal step ${i + 1} ('${linkName}') yielded ${currentNodes.length} nodes.`);
    }

    // Return the nodes found at the end of the path
    return currentNodes as IPLDNode[];
  }

  /** Sets the root CID and persists it if enabled. */
  private async setRootCID(cid: CID | null): Promise<void> {
      this.rootCID = cid;
      console.log(`IPLD KG: Root CID set to ${cid?.toString() || 'None'}`);
      if (this.persistenceOptions?.enabled && this.storage) {
          const rootPath = this.persistenceOptions.rootPath || '/.ipld-kg-root';
          const backendId = this.persistenceOptions.storageBackendId; // Needs a default?
          if (!backendId) {
              console.error('IPLD KG: Cannot persist root CID, storageBackendId not set in options.');
              return;
          }
          try {
              const vfsPath = `/${backendId}${rootPath}`; // Construct VFS path
              const data = Buffer.from(cid ? cid.toString() : '');
              await this.storage.write(vfsPath, data);
              console.log(`IPLD KG: Root CID persisted to VFS path ${vfsPath}`);
          } catch (error) {
              console.error(`IPLD KG: Failed to persist root CID to ${rootPath}:`, error);
          }
      }
  }

  /** Loads the root CID from persistence if enabled. */
  private async loadRootCID(): Promise<void> {
      if (!this.persistenceOptions?.enabled || !this.storage) return;

      const rootPath = this.persistenceOptions.rootPath || '/.ipld-kg-root';
      const backendId = this.persistenceOptions.storageBackendId;
       if (!backendId) {
           console.error('IPLD KG: Cannot load root CID, storageBackendId not set in options.');
           return;
       }
       const vfsPath = `/${backendId}${rootPath}`; // Construct VFS path

      try {
          if (await this.storage.exists(vfsPath)) {
              const data = await this.storage.read(vfsPath);
              const cidString = data.toString('utf-8');
              if (cidString) {
                  // CID is stored and used as a plain string; replace with CID.parse() from @multiformats/cid when available
                  this.rootCID = cidString;
                  console.log(`IPLD KG: Loaded root CID ${cidString} from VFS path ${vfsPath}`);
              } else {
                   console.log(`IPLD KG: Root CID file found at ${vfsPath} but was empty.`);
                   this.rootCID = null;
              }
          } else {
               console.log(`IPLD KG: No root CID file found at VFS path ${vfsPath}. Starting fresh.`);
               this.rootCID = null;
          }
      } catch (error) {
          console.error(`IPLD KG: Failed to load root CID from ${vfsPath}:`, error);
          this.rootCID = null; // Ensure root is null if loading fails
      }
  }

  clearCache(): void {
    this.nodeCache.clear();
    console.log('IPLD node cache cleared.');
  }

  /** Remove a node from the cache (IPLD nodes are immutable; deletion affects only the local cache). */
  evictFromCache(cid: string): boolean { return this.nodeCache.delete(cid); }

  /** Update node metadata and re-add as a new IPLD node (returns new CID). */
  async updateNode(cid: string, updates: Partial<IPLDNode>): Promise<string> {
    const existing = await this.getNode(cid);
    if (!existing) throw new Error(`Node ${cid} not found`);
    const updated: IPLDNode = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    return this.addNode(updated.data, updated.type, updated.id);
  }
}
