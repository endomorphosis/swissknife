/**
 * IPFS Storage Adapter (Mock) for VirtualFileSystem
 *
 * This is a placeholder implementation for IPFS. It simulates IPFS operations
 * but does not connect to a real IPFS network.
 */
export class IPFSAdapter {
    constructor() {
        console.warn('IPFSAdapter is a mock implementation. Real IPFS integration is not yet available.');
        this.mockFiles = {
            '/': [
                { name: 'ipfs-docs', type: 'directory', size: 0, modified: new Date(), path: '/ipfs-docs' },
                { name: 'hello-ipfs.txt', type: 'file', size: 12, modified: new Date(), path: '/hello-ipfs.txt', hash: 'QmHash123' }
            ],
            '/ipfs-docs/': [
                { name: 'about.md', type: 'file', size: 500, modified: new Date(), path: '/ipfs-docs/about.md', hash: 'QmHash456' }
            ]
        };
        this.mockContent = {
            '/hello-ipfs.txt': 'Hello from IPFS!',
            '/ipfs-docs/about.md': 'This is a mock IPFS document.'
        };
    }

    /**
     * Lists files and directories in a given path.
     * @param {object} options - { path: string, recursive: boolean }
     * @returns {Promise<Array>}
     */
    async list({ path = '/', recursive = false }) {
        const normalizedPath = path.endsWith('/') ? path : path + '/';
        const files = this.mockFiles[normalizedPath] || [];
        console.log(`IPFSAdapter: Listing ${normalizedPath}`, files);
        return Promise.resolve(files);
    }

    /**
     * Reads the content of a file.
     * @param {object} options - { path: string, hash?: string }
     * @returns {Promise<string|Blob>}
     */
    async read({ path, hash }) {
        const content = this.mockContent[path];
        if (content) {
            console.log(`IPFSAdapter: Reading ${path}`);
            return Promise.resolve(content);
        }
        return Promise.reject(new Error(`IPFSAdapter: File not found: ${path}`));
    }

    /**
     * Writes content to a file.
     * @param {object} options - { path: string, content: string|Blob }
     * @returns {Promise<object>}
     */
    async write({ path, content }) {
        console.log(`IPFSAdapter: Writing to ${path}`);
        // Simulate writing, but don't actually store
        this.mockFiles[path] = { name: path.split('/').pop(), type: 'file', size: content.length, modified: new Date(), path: path, hash: 'mockHash' + Math.random().toString(36).substring(7) };
        this.mockContent[path] = content;
        return Promise.resolve({ success: true, path, hash: 'mockHash' });
    }

    /**
     * Creates a directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>}
     */
    async createDirectory({ path }) {
        const normalizedPath = path.endsWith('/') ? path : path + '/';
        if (!this.mockFiles[normalizedPath]) {
            this.mockFiles[normalizedPath] = [];
            console.log(`IPFSAdapter: Created directory ${normalizedPath}`);
        }
        return Promise.resolve({ success: true, path: normalizedPath });
    }

    /**
     * Deletes a file or directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>}
     */
    async delete({ path }) {
        console.log(`IPFSAdapter: Deleting ${path}`);
        delete this.mockFiles[path];
        delete this.mockContent[path];
        return Promise.resolve({ success: true, path });
    }

    /**
     * Gets the status of the adapter.
     * @returns {Promise<object>} - { connected: boolean, message?: string }
     */
    async status() {
        console.log('IPFSAdapter: Checking status (mock)');
        return Promise.resolve({ connected: true, message: 'Mock IPFS connected' });
    }
}
