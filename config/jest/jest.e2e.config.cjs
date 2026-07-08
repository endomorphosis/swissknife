const baseConfig = require('./jest.base.config.cjs');
const { e2eTestMatch } = require('./test-lanes.cjs');

module.exports = {
  ...baseConfig,
  displayName: 'e2e',
  testMatch: e2eTestMatch,
  testTimeout: 60000,
  verbose: true,
};
