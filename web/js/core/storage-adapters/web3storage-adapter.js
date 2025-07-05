import { create } from '@web3-storage/w3up-client';

/**
 * Web3.Storage Adapter for VirtualFileSystem
 *
 * Implements the VFS interface using Web3.Storage for decentralized storage.
 */
export class Web3StorageAdapter {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.space = null; // The current space (delegated UCAN)
    }

    async init(privateKey, proof) {
        if (this.isReady) {
            return;
        }
        try {
            this.client = await create();
            // Authenticate with private key and proof (UCAN)
            await this.client.addSpace(proof);
            await this.client.setCurrentSpaceFromParts(proof.did(), privateKey);
            this.space = this.client.currentSpace();
            this.isReady = true;
            console.log(`Web3.Storage client initialized for space: ${this.space.did()}`);
        } catch (error) {
            console.error('Failed to initialize Web3.Storage client:', error);
            this.isReady = false;
            throw error;
        }
    }

    async _ensureReady() {
        if (!this.isReady) {
            // For simplicity, if not initialized, throw error or try with default (anonymous) client
            throw new Error('Web3.Storage adapter not initialized. Call init() with private key and proof.');
        }
    }

    /**
     * Lists files and directories in a given path.
     * @param {object} options - { path: string, recursive: boolean }
     * @returns {Promise<Array>} - Array of { name, type, size, modified, path, hash? }
     */
    async list({ path = '/', recursive = false }) {
        await this._ensureReady();
        console.warn('Web3StorageAdapter: list() is a placeholder. Web3.Storage primarily deals with CIDs, not hierarchical paths directly.');
        // Web3.Storage doesn't have a direct "list by path" API.
        // This would require maintaining a separate index (e.g., in IndexedDB or another service)
        // that maps VFS paths to CIDs stored on Web3.Storage.
        // For now, return a mock or empty array.
        return [];
    }

    /**
     * Reads the content of a file.
     * @param {object} options - { path: string, hash?: string }
     * @returns {Promise<string|Blob>} - File content.
     */
    async read({ path, hash }) {
        await this._ensureReady();
        if (!hash) {
            throw new Error('Web3StorageAdapter: read() requires a hash (CID) to retrieve content.');
        }
        try {
            const res = await this.client.get(hash);
            if (!res) {
                throw new Error(`Content not found for CID: ${hash}`);
            }
            const files = await res.files();
            if (files.length === 0) {
                throw new Error(`No files found for CID: ${hash}`);
            }
            // Assuming we want the first file's content
            const file = files[0];
            return file.text(); // Or file.blob()
        } catch (error) {
            console.error(`Web3StorageAdapter: Failed to read content for hash ${hash}:`, error);
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
            console.warn('Web3StorageAdapter: createDirectory() is not directly supported. Directories are implicit.');
            return { success: true, path, message: 'Directory creation is implicit in Web3.Storage.' };
        }
        try {
            const file = new File([content], path.split('/').pop()); // Create a File object
            const cid = await this.client.uploadFile(file);
            console.log(`Web3StorageAdapter: Wrote content to Web3.Storage. CID: ${cid}`);
            return { success: true, path, hash: cid.toString(), size: content.length, modified: new Date() };
        } catch (error) {
            console.error(`Web3StorageAdapter: Failed to write content to Web3.Storage for path ${path}:`, error);
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
        console.warn('Web3StorageAdapter: createDirectory() is a placeholder. Web3.Storage handles directories implicitly.');
        return { success: true, path, message: 'Directory creation handled implicitly by Web3.Storage.' };
    }

    /**
     * Deletes a file or directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async delete({ path }) {
        await this._ensureReady();
        console.warn('Web3StorageAdapter: delete() is a placeholder. Web3.Storage content is immutable.');
        return { success: false, path, message: 'Web3.Storage content is immutable. Deletion not supported in this adapter.' };
    }

    /**
     * Gets the status of the adapter.
     * @returns {Promise<object>} - { connected: boolean, message?: string }
     */
    async status() {
        if (this.isReady && this.client) {
            try {
                const info = await this.client.info();
                return { connected: true, message: `Web3.Storage connected. Space: ${info.did}` };
            } catch (error) {
                return { connected: false, message: `Web3.Storage client error: ${error.message}` };
            }
        } else {
            return { connected: false, message: 'Web3.Storage adapter not initialized.' };
        }
    }
}
