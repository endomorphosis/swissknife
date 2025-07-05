/**
 * ReplicationManager
 *
 * Orchestrates data replication across multiple VFS storage adapters and connected peers.
 */
export class ReplicationManager {
    constructor(vfs, network) {
        this.vfs = vfs;
        this.network = network;
        this.replicationTargets = []; // Array of adapter names or peer IDs
        this.peerFileIndex = new Map(); // Map<peerId, Set<fileHash>>
    }

    /**
     * Configures replication targets.
     * @param {Array<string>} targets - Array of adapter names (e.g., 's3', 'web3storage') or 'peers'.
     */
    configureReplication(targets) {
        this.replicationTargets = targets;
        console.log('Replication targets configured:', this.replicationTargets);
    }

    /**
     * Replicates a file to configured targets.
     * @param {string} path - VFS path of the file.
     * @param {string|Blob} content - Content of the file.
     * @param {object} options - Options including original adapter, hash, etc.
     */
    async replicate(path, content, options = {}) {
        const { originalAdapter, hash } = options;
        console.log(`Replicating file: ${path} (hash: ${hash})`);

        for (const target of this.replicationTargets) {
            if (target === originalAdapter) {
                continue; // Don't replicate to the source adapter
            }

            if (target === 'peers') {
                // Announce file to connected peers
                if (this.network && this.network.announceFiles) {
                    try {
                        await this.network.announceFiles([{ path, hash }]);
                        console.log(`Announced file ${path} to peers.`);
                    } catch (error) {
                        console.error(`Failed to announce file ${path} to peers:`, error);
                    }
                }
            } else if (this.vfs.adapters[target]) {
                // Replicate to another VFS adapter
                try {
                    // Ensure the target adapter is initialized if it has an init method
                    if (typeof this.vfs.adapters[target].init === 'function' && !this.vfs.adapters[target].isReady) {
                        // This is a simplified assumption. Real init might need credentials.
                        console.warn(`Attempting to init ${target} adapter for replication. Credentials might be missing.`);
                        await this.vfs.adapters[target].init();
                    }
                    await this.vfs.adapters[target].write({ path, content, hash, type: 'file' });
                    console.log(`Replicated file ${path} to ${target} adapter.`);
                } catch (error) {
                    console.error(`Failed to replicate file ${path} to ${target} adapter:`, error);
                }
            } else {
                console.warn(`Unknown replication target or adapter not found: ${target}`);
            }
        }
    }

    /**
     * Finds a file by hash across all available sources (local VFS, other adapters, peers).
     * @param {string} hash - The hash (CID) of the file to find.
     * @returns {Promise<string|Blob|null>} - The file content if found, otherwise null.
     */
    async findFile(hash) {
        // 1. Check active VFS adapter
        try {
            const activeAdapterName = this.vfs.getActiveAdapterName();
            const content = await this.vfs.read({ path: hash, hash: hash }); // Assuming read can take hash
            if (content) {
                console.log(`File ${hash} found in active adapter (${activeAdapterName}).`);
                return content;
            }
        } catch (error) {
            console.warn(`File ${hash} not found in active adapter:`, error.message);
        }

        // 2. Check other configured VFS adapters
        for (const adapterName in this.vfs.adapters) {
            if (adapterName === this.vfs.getActiveAdapterName()) continue;
            try {
                // Ensure adapter is ready if it has an init method
                if (typeof this.vfs.adapters[adapterName].init === 'function' && !this.vfs.adapters[adapterName].isReady) {
                    console.warn(`Attempting to init ${adapterName} adapter for findFile. Credentials might be missing.`);
                    await this.vfs.adapters[adapterName].init();
                }
                const content = await this.vfs.adapters[adapterName].read({ path: hash, hash: hash });
                if (content) {
                    console.log(`File ${hash} found in ${adapterName} adapter.`);
                    return content;
                }
            } catch (error) {
                console.warn(`File ${hash} not found in ${adapterName} adapter:`, error.message);
            }
        }

        // 3. Query connected peers
        if (this.network && this.network.requestFile) {
            for (const [peerId, files] of this.peerFileIndex.entries()) {
                if (files.has(hash)) {
                    try {
                        console.log(`Requesting file ${hash} from peer ${peerId}.`);
                        const content = await this.network.requestFile(peerId, hash);
                        if (content) {
                            console.log(`File ${hash} retrieved from peer ${peerId}.`);
                            return content;
                        }
                    } catch (error) {
                        console.error(`Failed to retrieve file ${hash} from peer ${peerId}:`, error);
                    }
                }
            }
        }

        console.log(`File ${hash} not found anywhere.`);
        return null;
    }

    /**
     * Registers files announced by a peer.
     * @param {string} peerId - The ID of the peer.
     * @param {Array<object>} files - Array of file objects ({ path, hash }).
     */
    registerPeerFiles(peerId, files) {
        const fileHashes = new Set(files.map(f => f.hash));
        this.peerFileIndex.set(peerId, fileHashes);
        console.log(`Registered ${fileHashes.size} files from peer ${peerId}.`);
    }

    /**
     * Performs periodic synchronization checks (placeholder).
     */
    async sync() {
        console.log('Performing replication synchronization check...');
        // This would involve comparing file lists/hashes across adapters and peers
        // and initiating transfers for missing or outdated files.
        // This is a complex task and will be implemented in detail later.
    }
}
