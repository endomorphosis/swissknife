import { HfInference } from '@huggingface/inference';
// Note: The @huggingface/hub library is more for server-side operations.
// For browser-side interaction, direct API calls or a more specific client might be needed.
// This implementation will focus on basic read operations for public models/datasets.

/**
 * HuggingFace Hub Storage Adapter for VirtualFileSystem
 *
 * Implements the VFS interface for interacting with HuggingFace Hub.
 * This adapter is primarily read-only for public models/datasets.
 */
export class HuggingFaceAdapter {
    constructor() {
        this.hf = null;
        this.isReady = false;
    }

    async init(hfToken) {
        if (this.isReady) {
            return;
        }
        try {
            this.hf = new HfInference(hfToken);
            // Test connection by making a small request, e.g., listing a popular model's files
            // This might be too heavy for init. Just setting isReady for now.
            this.isReady = true;
            console.log('HuggingFaceAdapter initialized.');
        } catch (error) {
            console.error('Failed to initialize HuggingFaceAdapter:', error);
            this.isReady = false;
            throw error;
        }
    }

    async _ensureReady() {
        if (!this.isReady) {
            throw new Error('HuggingFaceAdapter not initialized. Call init() with a HuggingFace token.');
        }
    }

    /**
     * Lists files and directories in a given path.
     * Path format: /<repo_type>/<repo_id>/<path_within_repo>
     * Example: /models/bert-base-uncased/tokenizer.json
     * @param {object} options - { path: string, recursive: boolean }
     * @returns {Promise<Array>} - Array of { name, type, size, modified, path, hash? }
     */
    async list({ path = '/', recursive = false }) {
        await this._ensureReady();
        console.warn('HuggingFaceAdapter: list() is a simplified implementation. Full repo browsing is complex.');

        const parts = path.split('/').filter(Boolean); // ['', 'models', 'bert-base-uncased'] -> ['models', 'bert-base-uncased']

        if (parts.length === 0) {
            // Listing root: show 'models', 'datasets', 'spaces'
            return [
                { name: 'models', type: 'directory', path: '/models/' },
                { name: 'datasets', type: 'directory', path: '/datasets/' },
                { name: 'spaces', type: 'directory', path: '/spaces/' },
            ];
        } else if (parts.length === 1) {
            // Listing repo types, e.g., /models
            // This would require listing all models/datasets, which is a huge API call.
            // For now, we'll return a placeholder or require specific repo_id.
            console.warn('HuggingFaceAdapter: Listing all models/datasets is not supported for performance reasons.');
            return [];
        } else if (parts.length >= 2) {
            // Listing within a specific repo: /<repo_type>/<repo_id>/...
            const repoType = parts[0]; // 'models', 'datasets', 'spaces'
            const repoId = parts[1];   // 'bert-base-uncased'
            const subPath = parts.slice(2).join('/'); // 'tokenizer.json' or 'data/train.csv'

            try {
                // This requires a specific API for listing repo contents, which HfInference doesn't directly provide.
                // The @huggingface/hub library has `listRepoFiles`, but it's Node.js focused.
                // A direct fetch to `https://huggingface.co/api/models/<repo_id>/tree/main` might work.
                const treeUrl = `https://huggingface.co/api/${repoType}/${repoId}/tree/main`;
                const response = await fetch(treeUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch repo tree: ${response.statusText}`);
                }
                const tree = await response.json();

                const results = [];
                for (const item of tree) {
                    const itemPath = item.path; // e.g., 'tokenizer.json', 'data/train.csv'
                    if (itemPath.startsWith(subPath)) {
                        const relativePath = itemPath.substring(subPath.length).split('/').filter(Boolean);
                        if (recursive || relativePath.length <= 1) { // Direct children or recursive
                            results.push({
                                name: relativePath[0] || item.path.split('/').pop(),
                                type: item.type === 'directory' ? 'directory' : 'file',
                                size: item.size,
                                path: `/${repoType}/${repoId}/${item.path}`,
                                hash: item.oid, // Git object ID
                            });
                        }
                    }
                }
                return results;
            } catch (error) {
                console.error(`HuggingFaceAdapter: Failed to list repo ${repoId} at path ${subPath}:`, error);
                return [];
            }
        }
        return [];
    }

    /**
     * Reads the content of a file.
     * Path format: /<repo_type>/<repo_id>/<path_within_repo>
     * @param {object} options - { path: string }
     * @returns {Promise<string|Blob>} - File content.
     */
    async read({ path }) {
        await this._ensureReady();
        const parts = path.split('/').filter(Boolean);
        if (parts.length < 3) {
            throw new Error('HuggingFaceAdapter: Invalid path for read operation. Expected /<repo_type>/<repo_id>/<file_path>');
        }
        const repoType = parts[0];
        const repoId = parts[1];
        const filePath = parts.slice(2).join('/');

        try {
            // Direct file access URL on HuggingFace Hub
            const fileUrl = `https://huggingface.co/${repoType}/${repoId}/resolve/main/${filePath}`;
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch file from HuggingFace Hub: ${response.statusText}`);
            }
            return response.text(); // Or response.blob() for binary files
        } catch (error) {
            console.error(`HuggingFaceAdapter: Failed to read file ${path}:`, error);
            throw error;
        }
    }

    /**
     * Writes content to a file.
     * HuggingFace Hub is primarily for model/dataset hosting, not general-purpose file writing via browser.
     * Writing usually involves Git operations or specific API endpoints for dataset/model uploads.
     * @param {object} options - { path: string, content: string|Blob, type: 'file'|'directory', size?: number, modified?: Date, hash?: string }
     * @returns {Promise<object>} - Success object.
     */
    async write({ path, content, type = 'file' }) {
        await this._ensureReady();
        console.warn('HuggingFaceAdapter: write() is not directly supported for general files. Use specific upload APIs or Git.');
        return { success: false, message: 'Writing to HuggingFace Hub is not supported via this adapter.' };
    }

    /**
     * Creates a directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async createDirectory({ path }) {
        await this._ensureReady();
        console.warn('HuggingFaceAdapter: createDirectory() is not directly supported. Directories are part of Git repo structure.');
        return { success: false, message: 'Creating directories on HuggingFace Hub is not supported via this adapter.' };
    }

    /**
     * Deletes a file or directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async delete({ path }) {
        await this._ensureReady();
        console.warn('HuggingFaceAdapter: delete() is not directly supported. Deletion involves Git operations.');
        return { success: false, message: 'Deleting from HuggingFace Hub is not supported via this adapter.' };
    }

    /**
     * Gets the status of the adapter.
     * @returns {Promise<object>} - { connected: boolean, message?: string }
     */
    async status() {
        if (this.isReady && this.hf) {
            return { connected: true, message: 'HuggingFace Hub adapter initialized.' };
        } else {
            return { connected: false, message: 'HuggingFace Hub adapter not initialized.' };
        }
    }
}
