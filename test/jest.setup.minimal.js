// Minimal Jest setup file for basic environment configuration.
// Minimal Jest setup file for basic environment configuration.
// This file is referenced in jest.config.cjs under setupFilesAfterEnv.

// Minimal environment helpers (inline to avoid transpiling TS in setup)
global.mockEnv = (envVars) => {
  const originalEnv = {};
  for (const key in envVars) {
    originalEnv[key] = process.env[key];
    process.env[key] = envVars[key];
  }
  return () => {
    for (const key in originalEnv) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  };
};
global.restoreEnv = () => { /* no-op placeholder; actual restore is returned by mockEnv */ };

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

// Set a default timeout for all tests to catch hanging tests
jest.setTimeout(15000); // 15 seconds
