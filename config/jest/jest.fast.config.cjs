const baseConfig = require('./jest.base.config.cjs');
const { fastTestMatch } = require('./test-lanes.cjs');

module.exports = {
  ...baseConfig,
  displayName: 'fast',
  testMatch: fastTestMatch,
  verbose: false,
  collectCoverageFrom: [
    'src/utils/array.ts',
    'src/utils/json.ts',
    'src/utils/string.ts',
    'src/utils/object.ts',
    'src/utils/validation.ts',
    'src/models/base.ts',
    'src/models/provider.ts',
    'src/models/execution/service.ts',
    'src/ai/agent-manager.ts',
    'src/config/simple-config.ts',
    'src/tasks/task-queue.ts',
    'src/commands/help-generator.ts',
    '!src/**/*.d.ts',
  ],
};
