
import { VirtualFilesystem } from '../../../src/storage/vfs/VirtualFilesystem';

describe('VirtualFilesystem', () => {
  it('should be able to create an instance', () => {
    const vfs = new VirtualFilesystem();
    expect(vfs).toBeDefined();
  });

  // Add more tests as functionality is implemented
});
