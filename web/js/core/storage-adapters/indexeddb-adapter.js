/**
 * IndexedDB Storage Adapter for VirtualFileSystem
 *
 * Implements the VFS interface using IndexedDB for persistent local storage.
 */
export class IndexedDBAdapter {
    constructor(dbName = 'swissknife-vfs', storeName = 'files') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
    }

    async _openDB() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                resolve(this.db);
                return;
            }

            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore(this.storeName, { keyPath: 'path' });
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async _getTransaction(mode = 'readonly') {
        const db = await this._openDB();
        return db.transaction(this.storeName, mode).objectStore(this.storeName);
    }

    /**
     * Lists files and directories in a given path.
     * @param {object} options - { path: string, recursive: boolean }
     * @returns {Promise<Array>} - Array of { name, type, size, modified, path, hash? }
     */
    async list({ path = '/', recursive = false }) {
        const tx = await this._getTransaction('readonly');
        const request = tx.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const allItems = request.result;
                const normalizedPath = path.endsWith('/') ? path : path + '/';
                const results = [];

                for (const item of allItems) {
                    if (item.path.startsWith(normalizedPath)) {
                        const relativePath = item.path.substring(normalizedPath.length);
                        if (recursive || !relativePath.includes('/')) {
                            // Only include direct children if not recursive
                            results.push({
                                name: relativePath.split('/')[0], // Get the first part for direct children
                                type: item.type,
                                size: item.size,
                                modified: item.modified,
                                path: item.path,
                                hash: item.hash // For content-addressed storage
                            });
                        }
                    }
                }
                // Deduplicate and format for display
                const uniqueResults = {};
                for (const item of results) {
                    const key = item.type === 'directory' ? item.path : item.path; // Use full path for uniqueness
                    if (!uniqueResults[key]) {
                        uniqueResults[key] = item;
                    }
                }
                resolve(Object.values(uniqueResults));
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Reads the content of a file.
     * @param {object} options - { path: string }
     * @returns {Promise<string|Blob>} - File content.
     */
    async read({ path }) {
        const tx = await this._getTransaction('readonly');
        const request = tx.get(path);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result && request.result.type === 'file') {
                    resolve(request.result.content);
                } else {
                    reject(new Error(`File not found or is not a file: ${path}`));
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Writes content to a file.
     * @param {object} options - { path: string, content: string|Blob, type: 'file'|'directory', size?: number, modified?: Date, hash?: string }
     * @returns {Promise<object>} - Success object.
     */
    async write({ path, content, type = 'file', size, modified, hash }) {
        const tx = await this._getTransaction('readwrite');
        const data = {
            path,
            content,
            type,
            size: size || (typeof content === 'string' ? content.length : content.byteLength || 0),
            modified: modified || new Date(),
            hash: hash // Optional: for content-addressed storage
        };
        const request = tx.put(data);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve({ success: true, path });
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Creates a directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async createDirectory({ path }) {
        const tx = await this._getTransaction('readwrite');
        const data = {
            path: path.endsWith('/') ? path : path + '/',
            type: 'directory',
            size: 0,
            modified: new Date()
        };
        const request = tx.add(data); // Use add to prevent overwriting existing directories

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve({ success: true, path });
            request.onerror = (event) => {
                if (event.target.error.name === 'ConstraintError') {
                    resolve({ success: true, path, message: 'Directory already exists' }); // Treat as success if directory already exists
                } else {
                    reject(request.error);
                }
            };
        });
    }

    /**
     * Deletes a file or directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async delete({ path }) {
        const tx = await this._getTransaction('readwrite');
        const request = tx.delete(path);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve({ success: true, path });
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Gets the status of the adapter.
     * @returns {Promise<object>} - { connected: boolean, message?: string, usage?: number }
     */
    async status() {
        try {
            const db = await this._openDB();
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const countRequest = store.count();

            return new Promise((resolve, reject) => {
                countRequest.onsuccess = () => {
                    let totalSize = 0;
                    const cursorRequest = store.openCursor();
                    cursorRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            totalSize += cursor.value.size || 0;
                            cursor.continue();
                        } else {
                            resolve({
                                connected: true,
                                message: 'IndexedDB is accessible',
                                usage: totalSize
                            });
                        }
                    };
                    cursorRequest.onerror = () => reject(cursorRequest.error);
                };
                countRequest.onerror = () => reject(countRequest.error);
            });
        } catch (error) {
            return { connected: false, message: `IndexedDB error: ${error.message}` };
        }
    }
}
