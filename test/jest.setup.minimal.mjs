// Minimal Jest setup file for basic environment configuration.
// This file is referenced in jest.config.cjs under setupFilesAfterEnv.

// Import and make global the test utility functions using relative path
import { mockEnv, restoreEnv } from './helpers/testUtils'; // Changed to relative import with .ts
global.mockEnv = mockEnv;
global.restoreEnv = restoreEnv;

// Mock fs module explicitly to control file system operations in tests
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs, // Include actual fs for unmocked methods
    // Explicitly mock synchronous methods used in tests
    existsSync: jest.fn(() => true), // Default to true for existence checks
    mkdirSync: jest.fn(),
    rmSync: jest.fn(),
    unlinkSync: jest.fn(),
    writeFileSync: jest.fn(),
    // Explicitly mock asynchronous methods (promises) used in tests
    promises: {
      ...actualFs.promises, // Include actual promises for unmocked methods
      readFile: jest.fn(),
      writeFile: jest.fn(),
      mkdir: jest.fn(),
      rm: jest.fn(),
      unlink: jest.fn(),
    },
    // Add other fs methods if tests require them and are not covered by ...actualFs
  };
});

// Mock common dependencies that might cause issues or are not relevant for unit tests
jest.mock("chalk", () => ({
  default: (str) => str,
  red: (str) => str,
  green: (str) => str,
  blue: (str) => str,
}));
jest.mock("nanoid", () => ({
  nanoid: () => "test-id",
}));

// Mock external dependencies
jest.mock('express', () => {
  const mockRouter = jest.fn(() => ({
    use: jest.fn(),
    post: jest.fn(),
    get: jest.fn(),
  }));
  const mockExpress = jest.fn(() => ({
    use: jest.fn(),
    listen: jest.fn(),
  }));
  mockExpress.Router = mockRouter;
  return mockExpress;
});

jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(() => ({})),
}));
jest.mock('@slack/socket-mode', () => ({
  SocketModeClient: jest.fn(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(() => ({
    rest: {
      pulls: {
        create: jest.fn(),
      },
    },
  })),
}));

// Mock internal dependencies
jest.mock('../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/* jest.mock('../src/ai/models/IntelligentSelector', () => ({
  IntelligentSelector: jest.fn(() => ({
    predictOptimalModel: jest.fn(),
  })),
})); */

/* jest.mock('../src/monitoring/MetricsCollector', () => ({
  MetricsCollector: jest.fn(() => ({
    track: jest.fn(),
  })),
})); */

/* jest.mock('../src/plugins/PluginLoader', () => ({
  PluginLoader: jest.fn(() => ({
    loadManifest: jest.fn(),
    loadCode: jest.fn(),
  })),
})); */

/* jest.mock('../src/plugins/PluginSandboxManager', () => ({
  PluginSandboxManager: jest.fn(() => ({
    createSandbox: jest.fn(),
  })),
})); */

jest.mock('../src/config/manager', () => ({
  ConfigManager: {
    getInstance: jest.fn(() => ({
      get: jest.fn(),
    })),
  },
}));

// Set a default timeout for all tests to catch hanging tests
jest.setTimeout(15000);