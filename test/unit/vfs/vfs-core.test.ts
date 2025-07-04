
import { VirtualFilesystem } from '../../../src/storage/vfs/VirtualFilesystem';
import { StorageBackend } from '../../../src/storage/vfs/StorageBackend';

// Mock StorageBackend implementation for testing
class MockBackend extends StorageBackend {
  name = 'mock';
  protocol = 'mock://';
  capabilities = { read: true, write: true, list: true, delete: true, stat: true, copy: false, mirror: false, metadata: false };
  private store: Map<string, Buffer> = new Map();

  async connect(): Promise<void> { /* no-op */ }
  async disconnect(): Promise<void> { /* no-op */ }
  async exists(path: string): Promise<boolean> { return this.store.has(path); }
  async read(path: string): Promise<Buffer> { return this.store.get(path) || Buffer.from(''); }
  async write(path: string, data: Buffer): Promise<string> { this.store.set(path, data); return path; }
  async delete(path: string): Promise<void> { this.store.delete(path); }
  async list(path: string): Promise<any[]> {
    const entries: any[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(path)) {
        entries.push({ name: key.substring(path.length), path: key, isDirectory: false, size: this.store.get(key)?.length || 0 });
      }
    }
    return entries;
  }
  async stat(path: string): Promise<any> { return { size: this.store.get(path)?.length || 0 }; }
  async getMetadata(path: string): Promise<any> { return {}; }
  async setMetadata(path: string, metadata: any): Promise<void> { /* no-op */ }
}

describe('Phase 1.5: Virtual Filesystem Core', () => {
  let vfs: VirtualFilesystem;
  let mockBackend1: MockBackend;
  let mockBackend2: MockBackend;

  beforeEach(async () => {
    vfs = new VirtualFilesystem();
    mockBackend1 = new MockBackend();
    mockBackend2 = new MockBackend();

    await vfs.mount('/mock1', mockBackend1);
    await vfs.mount('/mock2', mockBackend2);
  });

  it('should write and read a file from a mounted backend', async () => {
    const path = '/mock1/test.txt';
    const content = Buffer.from('Hello VFS!');
    await vfs.write(path, content);
    const readContent = await vfs.read(path);
    expect(readContent.toString()).toBe(content.toString());
  });

  it('should list files in a mounted backend', async () => {
    await vfs.write('/mock1/file1.txt', Buffer.from('content1'));
    await vfs.write('/mock1/file2.txt', Buffer.from('content2'));
    const entries = await vfs.list('/mock1/');
    expect(entries.length).toBe(2);
    expect(entries.some(e => e.name === 'file1.txt')).toBe(true);
    expect(entries.some(e => e.name === 'file2.txt')).toBe(true);
  });

  it('should copy a file between mounted backends', async () => {
    const srcPath = '/mock1/source.txt';
    const destPath = '/mock2/destination.txt';
    const content = Buffer.from('Copy me!');

    await vfs.write(srcPath, content);
    await vfs.copy(srcPath, destPath);

    const readContent = await vfs.read(destPath);
    expect(readContent.toString()).toBe(content.toString());
    // Ensure original file still exists
    expect(await mockBackend1.exists(srcPath)).toBe(true);
  });

  it('should mirror a file between mounted backends', async () => {
    const srcPath = '/mock1/mirror-source.txt';
    const destPath = '/mock2/mirror-destination.txt';
    const content = Buffer.from('Mirror me!');

    await vfs.write(srcPath, content);
    await vfs.mirror(srcPath, destPath);

    const readContent1 = await vfs.read(srcPath);
    const readContent2 = await vfs.read(destPath);

    expect(readContent1.toString()).toBe(content.toString());
    expect(readContent2.toString()).toBe(content.toString());
  });
});
