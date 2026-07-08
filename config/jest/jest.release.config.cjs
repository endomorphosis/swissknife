const baseConfig = require('./jest.base.config.cjs');
const { releaseTestMatch } = require('./test-lanes.cjs');

module.exports = {
  ...baseConfig,
  displayName: 'release-static',
  testMatch: releaseTestMatch,
  testTimeout: 30000,
  verbose: false,
};
