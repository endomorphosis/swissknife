/**
 * Storage Engine - Core storage functionality
 * Integrates with the Virtual File System (VFS) for robust file handling.
 */
export class StorageEngine {
    constructor(vfs) {
        this.vfs = vfs;
        this.ready = false;
        console.log('StorageEngine initialized with VFS');
    }

    async initialize() {
        if (!this.vfs) {
            console.error('VFS not provided to StorageEngine');
            return { success: false, error: 'VFS not available' };
        }
        this.ready = true;
        console.log('Storage Engine Initialized');
        return { success: true };
    }

    /**
     * Downloads a file from a URL and stores it in the VFS.
     * @param {string} url - The URL of the file to download.
     * @param {string} destinationPath - The path in the VFS to store the file.
     * @param {function} onProgress - Callback function for download progress.
     * @returns {Promise<object>} - A promise that resolves to a success object with file metadata.
     */
    async downloadAndStore(url, destinationPath, onProgress) {
        if (!this.ready) {
            return { success: false, error: 'Storage engine not initialized' };
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const contentLength = response.headers.get('content-length');
            const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
            let loadedSize = 0;

            const reader = response.body.getReader();
            const chunks = [];
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                chunks.push(value);
                loadedSize += value.length;
                if (onProgress && totalSize > 0) {
                    const progress = (loadedSize / totalSize) * 100;
                    onProgress({ progress, loadedSize, totalSize });
                }
            }

            const blob = new Blob(chunks);
            const result = await this.vfs.store({
                path: destinationPath,
                content: blob,
                metadata: {
                    url: url,
                    downloadedAt: new Date().toISOString()
                }
            });

            console.log(`File downloaded and stored at ${destinationPath}`);
            return { success: true, path: destinationPath, size: blob.size };

        } catch (error) {
            console.error(`Failed to download from ${url}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stores data in the VFS.
     * @param {string} key - The path/key to store the data under.
     * @param {any} value - The data to store (can be string, Blob, etc.).
     * @returns {Promise<object>}
     */
    async store(key, value) {
        if (!this.ready) {
            return { success: false, error: 'Storage engine not initialized' };
        }
        return this.vfs.write({ path: key, content: value });
    }

    /**
     * Retrieves data from the VFS.
     * @param {string} key - The path/key of the data to retrieve.
     * @returns {Promise<any>}
     */
    async retrieve(key) {
        if (!this.ready) {
            throw new Error('Storage engine not initialized');
        }
        return this.vfs.read({ path: key });
    }

    getStatus() {
        return { ready: this.ready, vfsAdapter: this.vfs.getActiveAdapterName() };
    }
}