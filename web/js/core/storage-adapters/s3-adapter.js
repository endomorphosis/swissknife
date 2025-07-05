import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * S3 Storage Adapter for VirtualFileSystem
 *
 * Implements the VFS interface using AWS S3 for cloud storage.
 */
export class S3Adapter {
    constructor() {
        this.s3Client = null;
        this.bucketName = null;
        this.isReady = false;
    }

    async init(region, accessKeyId, secretAccessKey, bucketName) {
        if (this.isReady) {
            return;
        }
        try {
            this.s3Client = new S3Client({
                region,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            });
            this.bucketName = bucketName;
            // Test connection by listing objects (or head bucket)
            await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName, MaxKeys: 1 }));
            this.isReady = true;
            console.log(`S3Adapter initialized for bucket: ${bucketName} in region: ${region}`);
        } catch (error) {
            console.error('Failed to initialize S3Adapter:', error);
            this.isReady = false;
            throw error;
        }
    }

    async _ensureReady() {
        if (!this.isReady) {
            throw new Error('S3Adapter not initialized. Call init() with region, credentials, and bucket name.');
        }
    }

    /**
     * Lists files and directories in a given path.
     * @param {object} options - { path: string, recursive: boolean }
     * @returns {Promise<Array>} - Array of { name, type, size, modified, path, hash? }
     */
    async list({ path = '/', recursive = false }) {
        await this._ensureReady();
        const prefix = path.startsWith('/') ? path.substring(1) : path; // S3 keys don't start with /
        const command = new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: prefix,
            Delimiter: recursive ? undefined : '/', // Use Delimiter for non-recursive listing (folders)
        });

        try {
            const response = await this.s3Client.send(command);
            const contents = response.Contents || [];
            const commonPrefixes = response.CommonPrefixes || [];

            const files = contents.map(item => ({
                name: item.Key.split('/').pop(),
                type: 'file',
                size: item.Size,
                modified: item.LastModified,
                path: `/${item.Key}`,
                hash: item.ETag ? item.ETag.replace(/"/g, '') : undefined, // ETag can serve as a hash
            }));

            const directories = commonPrefixes.map(item => ({
                name: item.Prefix.split('/').filter(Boolean).pop(), // Get last part of prefix
                type: 'directory',
                size: 0,
                modified: new Date(), // S3 doesn't provide modified for common prefixes
                path: `/${item.Prefix}`,
            }));

            return [...directories, ...files];
        } catch (error) {
            console.error(`S3Adapter: Failed to list path ${path}:`, error);
            return [];
        }
    }

    /**
     * Reads the content of a file.
     * @param {object} options - { path: string }
     * @returns {Promise<string|Blob>} - File content.
     */
    async read({ path }) {
        await this._ensureReady();
        const key = path.startsWith('/') ? path.substring(1) : path;
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });

        try {
            const response = await this.s3Client.send(command);
            // Assuming content is text for now, might need to handle Blob/Uint8Array
            return response.Body.transformToString();
        } catch (error) {
            console.error(`S3Adapter: Failed to read file ${path}:`, error);
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
        const key = path.startsWith('/') ? path.substring(1) : path;
        
        if (type === 'directory') {
            // S3 doesn't have explicit directories, they are implied by object keys ending with a slash.
            // Create a zero-byte object with a trailing slash to represent a directory.
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key.endsWith('/') ? key : `${key}/`,
                Body: '',
                ContentType: 'application/x-directory',
            });
            try {
                await this.s3Client.send(command);
                return { success: true, path, message: 'S3 directory marker created.' };
            } catch (error) {
                console.error(`S3Adapter: Failed to create directory marker ${path}:`, error);
                throw error;
            }
        } else {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: content,
                ContentType: typeof content === 'string' ? 'text/plain' : 'application/octet-stream', // Basic content type
            });
            try {
                const response = await this.s3Client.send(command);
                return { success: true, path, hash: response.ETag ? response.ETag.replace(/"/g, '') : undefined, size: content.length, modified: new Date() };
            } catch (error) {
                console.error(`S3Adapter: Failed to write file ${path}:`, error);
                throw error;
            }
        }
    }

    /**
     * Creates a directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async createDirectory({ path }) {
        await this._ensureReady();
        // S3 directories are objects with a trailing slash.
        return this.write({ path: path.endsWith('/') ? path : `${path}/`, content: '', type: 'directory' });
    }

    /**
     * Deletes a file or directory.
     * @param {object} options - { path: string }
     * @returns {Promise<object>} - Success object.
     */
    async delete({ path }) {
        await this._ensureReady();
        const key = path.startsWith('/') ? path.substring(1) : path;
        const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        try {
            await this.s3Client.send(command);
            return { success: true, path };
        } catch (error) {
            console.error(`S3Adapter: Failed to delete ${path}:`, error);
            throw error;
        }
    }

    /**
     * Gets the status of the adapter.
     * @returns {Promise<object>} - { connected: boolean, message?: string }
     */
    async status() {
        if (this.isReady && this.s3Client) {
            try {
                // Attempt to list objects to verify credentials and bucket access
                await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName, MaxKeys: 1 }));
                return { connected: true, message: `S3 connected to bucket: ${this.bucketName}` };
            } catch (error) {
                return { connected: false, message: `S3 connection error: ${error.message}` };
            }
        } else {
            return { connected: false, message: 'S3Adapter not initialized.' };
        }
    }
}
