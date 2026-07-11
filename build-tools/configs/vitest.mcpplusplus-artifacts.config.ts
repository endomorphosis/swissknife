import { defineConfig } from 'vitest/config';

// MCP++ artifacts use a real host filesystem Helia blockstore. The default
// browser-oriented Vitest setup intentionally mocks fs and is not valid here.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/mcp-plus-plus/mcpplusplus-artifact-store.test.ts'],
    testTimeout: 30000,
  },
});
