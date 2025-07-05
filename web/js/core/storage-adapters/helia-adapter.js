import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';

/**
 * Helia (IPFS) Storage Adapter for VirtualFileSystem
 *
 * Implements the VFS interface using Helia for IPFS storage.
 */
export class HeliaAdapter {
    constructor() {
        this.helia = null;
        this.fs = null;
        this.isReady = false;
    }

    async init() {
        if (this.isReady) {
            return;
        }
        try {
            this.helia = await createHelia();
            this.fs = unixfs(this.helia);
            this.isReady = true;
            console.log('Helia IPFS node started and ready.');
        } catch (error) {
            console.error('Failed to start Helia IPFS node:', error);
            this.isReady = false;
            throw error;
        }
    }

    async _ensureReady() {
        if (!this.isReady) {
            await this.init();
        }
    }

    /**
     * Lists files and directories in a given path.
     * @param {object} options - { path: string, recursive: boolean }
     * @returns {Promise<Array>} - Array of { name, type, size, modified, path, hash? }
     */
    async list({ path = '/', recursive = false }) {
        await this._ensureReady();
        // Helia's unixfs.ls expects a CID, not a path. This will require a mapping
        // from VFS paths to IPFS CIDs, which is a complex problem for a real VFS.
        // For now, this will be a simplified mock or require a root CID to list from.
        // Assuming 'path' here refers to a CID for demonstration.
        console.warn('HeliaAdapter: list() currently expects a CID as path. Real VFS path mapping is complex.');
        try {
            const entries = [];
            for await (const entry of this.fs.ls(path)) { // 'path' should be a CID here
                entries.push({
                    name: entry.name,
                    type: entry.type === 'dir' ? 'directory' : 'file',
                    size: entry.size,
                    path: `${path}/${entry.name}`, // Simplified path construction
                    hash: entry.cid.toString()
                });
            }
            return entries;
        } catch (error) {
            console.error(`HeliaAdapter: Failed to list path ${path}:`, error);
            return [];
        }
    }

    /**
     * Reads the content of a file.
     * @param {object} options - { path: string, hash?: string }
     * @returns {Promise<string|Blob>} - File content.
     */
    async read({ path, hash }) {
        await this._ensureReady();
        if (!hash) {
            console.error('HeliaAdapter: read() requires a hash (CID) to retrieve content.');
            throw new Error('HeliaAdapter: read() requires a hash (CID).');
        }
        try {
            const chunks = [];
            for await (const chunk of this.fs.cat(hash)) {
                chunks.push(chunk);
            }
            // Assuming content is text for now, might need to handle Blob/Uint8Array
            return new TextDecoder().decode(Uint8Array.from(chunks.flat()));
        } catch (error) {
            console.error(`HeliaAdapter: Failed to read content for hash ${hash}:`, error);
            throw error;
        }
    }

    /**
     * Writes content to a file.
     * @param {object} options - { path: string, content: string|Blob, type: 'file'|'directory', size?: number, modified?: Date, hash?: string }
     * @returns {Promise<object>} - Success object.
     */
    async write({ path, content, type = 'file' }) {
        await this._ensureReady();
        if (type === 'directory') {
            // Helia's unixfs.add doesn't directly create empty directories in the same way.
            // Directories are implicitly created when files are added to them.
            // For a true VFS, this would involve creating a directory CID.
            console.warn('HeliaAdapter: createDirectory() is not directly supported by unixfs.add for empty directories. Directories are implicit.');
            return { success: true, path, message: 'Directory creation is implicit in Helia.' };
        }
        try {
            const contentBytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
            const result = await this.fs.addBytes(contentBytes);
            const cid = result.toString();
            console.log(`HeliaAdapter: Wrote content to IPFS. CID: ${cid}`);
            return { success: true, path, hash: cid, size: contentBytes.length, modified: new Date() };
        } catch (error) {
            console.error(`HeliaAdapter: Failed to write content to IPFS for path ${path}:`, error);
            throw error;
        }
    }

    /**
     * Creates a directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async createDirectory({ path }) {
        await this._ensureReady();
        // In IPFS, directories are typically created by adding files to them,
        // or by explicitly creating an empty directory CID.
        // For simplicity, we'll just return success for now, assuming the VFS
        // will handle the actual linking when files are added.
        console.warn('HeliaAdapter: createDirectory() is a placeholder. Actual IPFS directory creation involves DAGs.');
        return { success: true, path, message: 'Directory creation handled implicitly by IPFS.' };
    }

    /**
     * Deletes a file or directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async delete({ path }) {
        await this._ensureReady();
        // Deleting from IPFS is complex as content is immutable.
        // This would typically involve updating a mutable pointer (like IPNS)
        // or simply removing the reference from the local node's pinset.
        console.warn('HeliaAdapter: delete() is a placeholder. IPFS content is immutable.');
        return { success: false, path, message: 'IPFS content is immutable. Deletion not supported in this adapter.' };
    }

    /**
     * Gets the status of the adapter.
     * @returns {Promise<object>} - { connected: boolean, message?: string }
     */
    async status() {
        if (this.helia && this.isReady) {
            return { connected: true, message: 'Helia IPFS node is running.' };
        } else {
            return { connected: false, message: 'Helia IPFS node is not running or failed to initialize.' };
        }
    }
}
