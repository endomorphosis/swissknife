const baseConfig = require('./jest.base.config.cjs');
const { browserCompatStaticTestMatch } = require('./test-lanes.cjs');

module.exports = {
  ...baseConfig,
  displayName: 'browser-compat-static',
  testMatch: browserCompatStaticTestMatch,
  verbose: false,
};
