module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      transform: {
        '^.+\.tsx?$': ['ts-jest', { useESM: true }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@src/(.*)$': '<rootDir>/src/$1',
        '^@test-helpers/(.*)$': '<rootDir>/test/helpers/$1',
      },
      testMatch: [
        '<rootDir>/test/**/*.test.ts',
        '<rootDir>/test/**/*.test.js',
        '<rootDir>/test/**/*.spec.ts',
        '<rootDir>/test/**/*.spec.js',
      ],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    },
    {
      displayName: 'web',
      preset: 'jest-playwright-preset',
      testMatch: [
        '<rootDir>/web/test/**/*.test.ts',
      ],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'web/tsconfig.json' }],
      },
    }
  ]
};
