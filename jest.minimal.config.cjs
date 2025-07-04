/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/simple-direct-test.ts',
  ],
  transform: {
    '^.+\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
};