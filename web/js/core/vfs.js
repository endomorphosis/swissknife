/**
 * VirtualFileSystem (VFS) Core
 *
 * This class acts as an abstraction layer for different storage backends.
 * It dispatches file operations to the currently active storage adapter.
 */
export class VirtualFileSystem {
    constructor(adapters = {}, defaultAdapter = 'indexeddb') {
        this.adapters = adapters;
        this.activeAdapter = null;
        this.defaultAdapter = defaultAdapter;

        if (Object.keys(this.adapters).length > 0) {
            this.setAdapter(this.defaultAdapter);
        } else {
            console.warn('VFS initialized without any adapters. Please add adapters using addAdapter().');
        }
    }

    /**
     * Adds a new storage adapter to the VFS.
     * @param {string} name - The name of the adapter (e.g., 'indexeddb', 'ipfs', 's3').
     * @param {object} adapterInstance - An instance of the adapter class.
     */
    addAdapter(name, adapterInstance) {
        this.adapters[name] = adapterInstance;
        if (!this.activeAdapter) {
            this.setAdapter(name); // Set the first added adapter as active if none is set
        }
    }

    /**
     * Sets the active storage adapter.
     * @param {string} name - The name of the adapter to activate.
     */
    setAdapter(name) {
        if (this.adapters[name]) {
            this.activeAdapter = this.adapters[name];
            console.log(`VFS: Active adapter set to ${name}`);
        } else {
            console.error(`VFS: Adapter "${name}" not found.`);
            throw new Error(`Adapter "${name}" not found.`);
        }
    }

    /**
     * Gets the name of the currently active adapter.
     * @returns {string|null}
     */
    getActiveAdapterName() {
        for (const name in this.adapters) {
            if (this.adapters[name] === this.activeAdapter) {
                return name;
            }
        }
        return null;
    }

    /**
     * Lists files and directories in a given path using the active adapter.
     * @param {object} options - Options for listing (e.g., { path: '/', recursive: false }).
     * @returns {Promise<Array>} - A promise that resolves to an array of file/directory objects.
     */
    async list(options) {
        if (!this.activeAdapter || typeof this.activeAdapter.list !== 'function') {
            throw new Error('Active adapter not set or does not implement list() method.');
        }
        return this.activeAdapter.list(options);
    }

    /**
     * Reads the content of a file using the active adapter.
     * @param {object} options - Options for reading (e.g., { path: '/file.txt' }).
     * @returns {Promise<string|Blob>} - A promise that resolves to the file content.
     */
    async read(options) {
        if (!this.activeAdapter || typeof this.activeAdapter.read !== 'function') {
            throw new Error('Active adapter not set or does not implement read() method.');
        }
        return this.activeAdapter.read(options);
    }

    /**
     * Writes content to a file using the active adapter.
     * @param {object} options - Options for writing (e.g., { path: '/file.txt', content: 'hello' }).
     * @returns {Promise<object>} - A promise that resolves to a success object.
     */
    async write(options) {
        if (!this.activeAdapter || typeof this.activeAdapter.write !== 'function') {
            throw new Error('Active adapter not set or does not implement write() method.');
        }
        return this.activeAdapter.write(options);
    }

    /**
     * Creates a directory using the active adapter.
     * @param {object} options - Options for creating directory (e.g., { path: '/new-folder' }).
     * @returns {Promise<object>} - A promise that resolves to a success object.
     */
    async createDirectory(options) {
        if (!this.activeAdapter || typeof this.activeAdapter.createDirectory !== 'function') {
            throw new Error('Active adapter not set or does not implement createDirectory() method.');
        }
        return this.activeAdapter.createDirectory(options);
    }

    /**
     * Deletes a file or directory using the active adapter.
     * @param {object} options - Options for deleting (e.g., { path: '/file.txt' }).
     * @returns {Promise<object>} - A promise that resolves to a success object.
     */
    async delete(options) {
        if (!this.activeAdapter || typeof this.activeAdapter.delete !== 'function') {
            throw new Error('Active adapter not set or does not implement delete() method.');
        }
        return this.activeAdapter.delete(options);
    }

    /**
     * Gets the status of the active adapter.
     * @returns {Promise<object>} - A promise that resolves to the adapter's status.
     */
    async status() {
        if (!this.activeAdapter || typeof this.activeAdapter.status !== 'function') {
            throw new Error('Active adapter not set or does not implement status() method.');
        }
        return this.activeAdapter.status();
    }
}
