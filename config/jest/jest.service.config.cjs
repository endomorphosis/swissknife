const baseConfig = require('./jest.base.config.cjs');
const { serviceTestMatch } = require('./test-lanes.cjs');

module.exports = {
  ...baseConfig,
  displayName: 'service',
  testMatch: serviceTestMatch,
  verbose: false,
};
