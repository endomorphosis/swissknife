/**
 * Unit tests for Storage System
 */

import * as path from 'path';
// Use jest's expect, remove chai/sinon
// import { expect } from 'chai';
// import * as sinon from 'sinon';
// Use relative paths with .js extension
import { createTempTestDir, removeTempTestDir } from '../../helpers/testUtils.js';
// Remove createMockStorage if not used
// import { createMockStorage } from '../../helpers/mockStorage.js';

// Mock the MCP client based on Phase 2 plan
jest.mock('../../../src/storage/ipfs/mcp-client.js', () => {
  const mockIpfsStorage = new Map<string, Buffer>();

  return {
    MCPClient: jest.fn().mockImplementation(() => ({
      // Mock methods used by IPFSStorage in Phase 2
      addContent: jest.fn().mockImplementation(async (content) => {
        const data = typeof content === 'string' ? Buffer.from(content) : content;
        // Simulate CID generation (e.g., hash)
        const cid = `mock-cid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        mockIpfsStorage.set(cid, data);
        return { cid }; // Return structure expected by IPFSStorage
      }),
      getContent: jest.fn().mockImplementation(async (cid) => {
        const content = mockIpfsStorage.get(cid);
        if (!content) {
          throw new Error(`Content not found for CID: ${cid}`);
        }
        return content;
      }),
      pinContent: jest.fn().mockImplementation(async (cid) => {
        // Simulate pinning success
        return mockIpfsStorage.has(cid);
      }),
      listPins: jest.fn().mockImplementation(async () => {
        // Return all keys as pinned CIDs for testing list()
        return Array.from(mockIpfsStorage.keys());
      }),
      // Mock unpinContent for delete() - assuming it exists on MCPClient
      unpinContent: jest.fn().mockImplementation(async (cid) => {
         return mockIpfsStorage.delete(cid);
      }),
      // Remove graph/task specific methods from mock
      // storeGraph: jest.fn()...,
      // loadGraph: jest.fn()...,
    }))
  };
});

// Import after mocks - use .js extensions
// Remove StorageFactory import
// import { StorageFactory } from '../../../src/storage/factory.js';
import { IPFSStorage } from '../../../src/storage/ipfs/ipfs-storage.js';
// Rename LocalStorage to FileStorage and update path - Revert to relative path
import { FileStorage } from '../../../src/storage/local/file-storage.js';
import { MCPClient } from '../../../src/storage/ipfs/mcp-client.js';
// Import StorageProvider interface
import { StorageProvider } from '../../../src/storage/provider.js';

describe('Storage System (Phase 2 Plan)', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create temp directory for testing local storage
    tempDir = await createTempTestDir();
  });

  afterAll(async () => {
    // Clean up temp directory
    await removeTempTestDir(tempDir);
  });

  describe('IPFSStorage', () => {
    let storage: IPFSStorage; // Use specific type
    let mcpClient: jest.Mocked<MCPClient>; // Use mocked type

    beforeEach(() => {
      // Clear mocks before each test
      jest.clearAllMocks();
      // Create new MCP client mock instance and storage for each test
      // MCPClient constructor is mocked, so this gives us the mocked instance
      mcpClient = new MCPClient({ baseUrl: 'http://mock-ipfs:5001' }) as jest.Mocked<MCPClient>;
      // Pass the MCPClient INSTANCE to IPFSStorage constructor based on error
      storage = new IPFSStorage(mcpClient);
      // No need to inject client manually if constructor takes it
      // (storage as any).client = mcpClient;
    });

    // No need for afterEach clearAllMocks if beforeEach does it

    describe('add', () => {
      it('should add content, call MCPClient.addContent, and return CID', async () => {
        const content = 'Test content for IPFS storage';
        const mockCid = 'mock-cid-123';
        // Use the mock instance directly for setting up mock return values and assertions
        // Explicitly cast mocked methods to jest.Mock for type safety
        (mcpClient.addContent as jest.Mock).mockResolvedValue({ cid: mockCid });
        (mcpClient.pinContent as jest.Mock).mockResolvedValue(true);

        const cid = await storage.add(content); // Default pins=true

        expect(cid).toBe(mockCid);
        expect(mcpClient.addContent).toHaveBeenCalledWith(content);
        expect(mcpClient.pinContent).toHaveBeenCalledWith(mockCid); // Verify pinning
      });

      it('should support Buffer content', async () => {
        const content = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        const mockCid = 'mock-cid-buffer';
        (mcpClient.addContent as jest.Mock).mockResolvedValue({ cid: mockCid });
        (mcpClient.pinContent as jest.Mock).mockResolvedValue(true);

        const cid = await storage.add(content);

        expect(cid).toBe(mockCid);
        expect(mcpClient.addContent).toHaveBeenCalledWith(content);
        expect(mcpClient.pinContent).toHaveBeenCalledWith(mockCid);
      });

      it('should not pin content if options.pin is false', async () => {
          const content = 'Do not pin me';
          const mockCid = 'mock-cid-nopin';
          (mcpClient.addContent as jest.Mock).mockResolvedValue({ cid: mockCid });

          const cid = await storage.add(content, { pin: false });

          expect(cid).toBe(mockCid);
          expect(mcpClient.addContent).toHaveBeenCalledWith(content);
          expect(mcpClient.pinContent).not.toHaveBeenCalled();
      });
    });

    describe('get', () => {
      it('should retrieve content by CID via MCPClient.getContent', async () => {
        const content = 'Test content for retrieval';
        const mockCid = 'mock-cid-get';
        const contentBuffer = Buffer.from(content);
        (mcpClient.getContent as jest.Mock).mockResolvedValue(contentBuffer);

        const retrievedContent = await storage.get(mockCid);

        expect(retrievedContent).toBeInstanceOf(Buffer);
        expect(retrievedContent.toString()).toBe(content);
        expect(mcpClient.getContent).toHaveBeenCalledWith(mockCid);
      });

      it('should throw error for non-existent CID', async () => {
        const mockCid = 'non-existent-cid';
        (mcpClient.getContent as jest.Mock).mockRejectedValue(new Error(`Content not found for CID: ${mockCid}`));

        // The IPFSStorage class might wrap the error
        await expect(storage.get(mockCid)).rejects.toThrow(/Failed to get content/);
        expect(mcpClient.getContent).toHaveBeenCalledWith(mockCid);
      });
    });

    describe('list', () => {
      it('should list pinned CIDs via MCPClient.listPins', async () => {
        const mockCids = ['mock-cid-1', 'mock-cid-2'];
        (mcpClient.listPins as jest.Mock).mockResolvedValue(mockCids);

        const listedCids = await storage.list(); // No query args in Phase 2 plan

        expect(listedCids).toEqual(mockCids);
        expect(mcpClient.listPins).toHaveBeenCalled();
      });

      // Remove filtering tests as list() takes no args in Phase 2 plan
      // it('should support filtering by prefix', async () => { ... });
      // it('should support limiting results', async () => { ... });
    });

    describe('delete', () => {
      it('should unpin content by CID via MCPClient.unpinContent', async () => {
        const mockCid = 'mock-cid-delete';
        // Assume unpinContent exists on the mock and returns true on success
        (mcpClient.unpinContent as jest.Mock).mockResolvedValue(true);

        const result = await storage.delete(mockCid);

        expect(result).toBe(true);
        expect(mcpClient.unpinContent).toHaveBeenCalledWith(mockCid);
      });

      it('should return false if unpinning fails', async () => {
         const mockCid = 'mock-cid-fail-delete';
         (mcpClient.unpinContent as jest.Mock).mockResolvedValue(false); // Mock failure

         const result = await storage.delete(mockCid);

         expect(result).toBe(false);
         expect(mcpClient.unpinContent).toHaveBeenCalledWith(mockCid);
      });

       it('should return false if unpinning throws error', async () => {
         const mockCid = 'mock-cid-error-delete';
         (mcpClient.unpinContent as jest.Mock).mockRejectedValue(new Error('Unpin failed')); // Mock error

         const result = await storage.delete(mockCid);

         expect(result).toBe(false);
         expect(mcpClient.unpinContent).toHaveBeenCalledWith(mockCid);
      });
    });

    // Remove Task storage tests as they are not part of StorageProvider in Phase 2
    // describe('Task storage', () => { ... });
  });

  // Rename LocalStorage to FileStorage
  describe('FileStorage', () => {
    let storage: FileStorage; // Use specific type
    let storagePath: string;

    beforeEach(async () => {
      // Create unique subdirectory for each test
      storagePath = path.join(tempDir, `file-storage-${Date.now()}`);
      // Create new file storage for each test
      storage = new FileStorage({
        basePath: storagePath,
        createDir: true // Ensure directory is created
      });
      // Wait briefly for async constructor operations if needed (like loadMetadata)
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    afterEach(async () => {
        // Clean up specific test directory
        await removeTempTestDir(storagePath);
    });

    describe('basic operations', () => {
      it('should add content, return hash ID, and store file', async () => {
        const content = 'Test content for file storage';
        const contentBuffer = Buffer.from(content);
        const expectedHash = require('crypto').createHash('sha256').update(contentBuffer).digest('hex');

        const id = await storage.add(content);
        expect(id).toBe(expectedHash);

        // Verify file exists and content matches
        const filePath = path.join(storagePath, expectedHash);
        const fileContent = await require('fs/promises').readFile(filePath);
        expect(fileContent).toEqual(contentBuffer);

        // Verify metadata was saved (optional check)
        const metadataContent = await require('fs/promises').readFile(path.join(storagePath, '.metadata.json'), 'utf-8');
        const metadata = JSON.parse(metadataContent);
        expect(metadata[expectedHash]).toBeDefined();
        expect(metadata[expectedHash].size).toBe(contentBuffer.length);
      });

      it('should retrieve content by hash ID', async () => {
        const content = 'Content to retrieve';
        const id = await storage.add(content);

        const retrievedContent = await storage.get(id);

        expect(retrievedContent).toBeInstanceOf(Buffer);
        expect(retrievedContent.toString()).toBe(content);
      });

       it('should throw error for non-existent hash ID', async () => {
        const nonExistentHash = 'a'.repeat(64); // Valid hash format, but doesn't exist
        await expect(storage.get(nonExistentHash)).rejects.toThrow(`Content not found: ${nonExistentHash}`);
      });

       it('should throw error for invalid hash ID format', async () => {
        await expect(storage.get('invalid-id')).rejects.toThrow('Invalid content ID format');
      });

      it('should list all content hash IDs', async () => {
        const id1 = await storage.add('Content 1');
        const id2 = await storage.add('Content 2');

        const listedIds = await storage.list();

        expect(listedIds).toHaveLength(2);
        expect(listedIds).toContain(id1);
        expect(listedIds).toContain(id2);
      });

      it('should delete content by hash ID', async () => {
        const content = 'Content to delete';
        const id = await storage.add(content);

        // Verify file exists before delete
        const filePath = path.join(storagePath, id);
        await expect(require('fs/promises').access(filePath)).resolves.toBeUndefined();

        const deleteResult = await storage.delete(id);
        expect(deleteResult).toBe(true);

        // Verify file is deleted
        await expect(require('fs/promises').access(filePath)).rejects.toThrow();
        // Verify retrieval fails
        await expect(storage.get(id)).rejects.toThrow('Content not found');
        // Verify not in list
        expect(await storage.list()).not.toContain(id);
      });

       it('should handle deleting non-existent ID gracefully', async () => {
           const nonExistentHash = 'b'.repeat(64);
           const deleteResult = await storage.delete(nonExistentHash);
           expect(deleteResult).toBe(true); // Returns true if file doesn't exist
       });
    });

    // Remove Task storage tests
    // describe('task storage', () => { ... });
  });

  // Remove StorageFactory tests
  // describe('StorageFactory', () => { ... });
});
