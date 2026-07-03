import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
export class FileStorage {
    basePath;
    metadataDir; // Store metadata in a separate .metadata subdirectory
    constructor(options) {
        this.basePath = path.resolve(options.basePath); // Ensure absolute path
        this.metadataDir = path.join(this.basePath, '.metadata');
        if (options.createDir) {
            fs.mkdir(this.basePath, { recursive: true })
                .then(() => fs.mkdir(this.metadataDir, { recursive: true }))
                .catch(err => console.error('Error creating storage directory or metadata directory:', err));
        }
        else {
            // Ensure metadata directory exists if base path exists, or it will fail later
            fs.access(this.basePath)
                .then(() => fs.mkdir(this.metadataDir, { recursive: true }))
                .catch(() => { });
        }
    }
    contentPath(cid) {
        return path.join(this.basePath, cid);
    }
    metadataPath(cid) {
        return path.join(this.metadataDir, `${cid}.json`);
    }
    async readMetadata(cid) {
        try {
            const metaContent = await fs.readFile(this.metadataPath(cid), 'utf-8');
            return JSON.parse(metaContent);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return null; // File not found
            throw error;
        }
    }
    async writeMetadata(cid, metadata) {
        await fs.writeFile(this.metadataPath(cid), JSON.stringify(metadata, null, 2));
    }
    async add(content, options) {
        const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
        // Using SHA256 hash of content as CID for file storage.
        // For IPFS compatibility, a true IPFS CID would be generated if adding to IPFS.
        const hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
        const cid = hash; // In a real IPFS context, this would be a proper CID.
        const filePath = this.contentPath(cid);
        await fs.writeFile(filePath, contentBuffer);
        const now = Date.now();
        const metadata = {
            contentType: options?.contentType,
            size: contentBuffer.length,
            createdAt: now,
            updatedAt: now,
            tags: options?.tags,
            ...(options?.metadata || {}),
            // Store original filename if provided in options
            originalFilename: options?.filename
        };
        await this.writeMetadata(cid, metadata);
        console.log(`FileStorage: Added content ${cid} (size: ${metadata.size})`);
        return cid;
    }
    async get(cid) {
        try {
            const filePath = this.contentPath(cid);
            const content = await fs.readFile(filePath);
            console.log(`FileStorage: Retrieved content ${cid}`);
            return content;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Content not found with CID: ${cid}`);
            }
            throw error;
        }
    }
    async exists(cid) {
        try {
            await fs.access(this.contentPath(cid));
            return true;
        }
        catch {
            return false;
        }
    }
    async delete(cid) {
        try {
            await fs.unlink(this.contentPath(cid));
            // Attempt to delete metadata, ignore if it fails (e.g., already deleted)
            await fs.unlink(this.metadataPath(cid)).catch(() => { });
            console.log(`FileStorage: Deleted content ${cid}`);
            return true;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return true; // Already deleted
            console.error(`FileStorage: Error deleting content ${cid}:`, error);
            return false;
        }
    }
    async getMetadata(cid) {
        const metadata = await this.readMetadata(cid);
        return metadata || undefined;
    }
    async updateMetadata(cid, metadataUpdate) {
        const existingMetadata = await this.readMetadata(cid);
        if (!existingMetadata) {
            return false; // Cannot update metadata for non-existent content
        }
        const updatedMetadata = {
            ...existingMetadata,
            ...metadataUpdate,
            updatedAt: Date.now(), // Always update the updatedAt timestamp
        };
        await this.writeMetadata(cid, updatedMetadata);
        console.log(`FileStorage: Updated metadata for ${cid}`);
        return true;
    }
    async list(options) {
        // Basic implementation: lists all CIDs (filenames in base directory, excluding metadata dir)
        // Filtering/sorting would require reading all metadata files.
        try {
            const files = await fs.readdir(this.basePath);
            const cids = files.filter(file => {
                // A simple check: assume files that don't have a typical extension and are not the metadata dir
                // might be content files named by their hash/CID.
                // This is a naive check and depends on naming convention.
                return !path.extname(file) && file !== '.metadata';
            });
            // Apply options: sortBy, limit, offset (mirrors file-storage.ts)
            if (options && options.sortBy === 'name') cids.sort();
            const offset = options && options.offset ? Number(options.offset) : 0;
            const limit  = options && options.limit  ? Number(options.limit)  : cids.length;
            return { cids: cids.slice(offset, offset + limit) };
        }
        catch (error) {
            console.error("FileStorage: Error listing files:", error);
            return { cids: [] };
        }
    }
}
//# sourceMappingURL=file-storage.js.map