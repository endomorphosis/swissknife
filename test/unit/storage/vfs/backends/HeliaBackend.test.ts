
import { HeliaBackend } from '../../../src/storage/vfs/backends/HeliaBackend';

describe('HeliaBackend', () => {
  it('should be able to create an instance', () => {
    const backend = new HeliaBackend();
    expect(backend).toBeDefined();
  });

  // Add more tests as functionality is implemented
});
