const { archivedAndBackupIgnorePatterns } = require('./test-lanes.cjs');

module.exports = {
  testEnvironment: 'node',
  rootDir: '../..',
  transform: {
    '^.+\\.(ts|tsx|mts)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
      ],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }],
    '^.+\\.(js|jsx|cjs)$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol|ink|ink-testing-library|react-is|merkletreejs|ansi-escapes|environment|uuid|is-in-ci|auto-bind|patch-console|yoga-layout)/)',
  ],
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  globals: {
    crypto: require('crypto'),
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.minimal.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePaths: ['<rootDir>/src', '<rootDir>/test'],
  moduleNameMapper: {
    '^@src/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@dist/(.*)$': '<rootDir>/dist/$1',
    '^@/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test-helpers/(.*)$': '<rootDir>/test/helpers/$1',
    '../utils/test-helpers': '<rootDir>/test/utils/test-helpers.ts',
    '^(ffjavascript)$': '<rootDir>/node_modules/ffjavascript/build/main.cjs',
    '^(merkletreejs)$': '<rootDir>/node_modules/merkletreejs/dist/esm/index.js',
    '^(snarkjs)$': '<rootDir>/node_modules/snarkjs/build/main.cjs',
    '^(zod)$': '<rootDir>/node_modules/zod/dist/esm/index.js',
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  testPathIgnorePatterns: archivedAndBackupIgnorePatterns,
  modulePathIgnorePatterns: [
    '<rootDir>/cleanup-archive/',
    '<rootDir>/emergency-archive/',
    '<rootDir>/swissknife_old/',
    '<rootDir>/test/archived/',
    '<rootDir>/config/archive/',
  ],
  testTimeout: 15000,
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
};
