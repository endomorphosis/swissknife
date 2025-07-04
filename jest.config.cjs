/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@test-helpers/(.*)$': '<rootDir>/test/helpers/$1',
  },
  transform: {
    '^.+\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  testMatch: [
    '<rootDir>/test/**/*.test.(ts|js)',
    '<rootDir>/test/**/*.spec.(ts|js)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
