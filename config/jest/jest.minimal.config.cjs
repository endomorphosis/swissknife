module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  transform: {
    "^.+\.(ts|tsx|mts|js|jsx)$": ["ts-jest", {
      useESM: false,
      tsconfig: "config/typescript/tsconfig.test.json",
      diagnostics: false,
      isolatedModules: true
    }]
  },
  transformIgnorePatterns: [
    "node_modules/"
  ],
  resolver: 'ts-jest-resolver',
  moduleNameMapper: {
    "^uuid$": require.resolve('uuid'),
    "^(merkletreejs)$": "<rootDir>/node_modules/merkletreejs/dist/index.js",
    "^(zod)$": "<rootDir>/node_modules/zod/dist/esm/index.js",
    "../types/ai": "<rootDir>/src/types/ai.ts",
    "../types/common": "<rootDir>/src/types/common.ts",
    "^@src/(.*)$": "<rootDir>/src/$1.ts",
    "^@/(.*)$": "<rootDir>/src/$1.ts",
    "^@test-helpers/(.*)$": "<rootDir>/test/helpers/$1",
    "../utils/test-helpers": "<rootDir>/test/utils/test-helpers.ts"
  },
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  globals: {
    'crypto': require('crypto'),
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.minimal.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePaths: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    "<rootDir>/test/**/*.test.ts",
    "<rootDir>/test/**/*.test.tsx",
    "<rootDir>/test/**/*.test.js",
    "<rootDir>/test/**/*.test.jsx"
  ],
  verbose: true,
  testTimeout: 10000,
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/**/*.d.ts"
  ]
};