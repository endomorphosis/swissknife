const archivedAndBackupIgnorePatterns = [
  '<rootDir>/test/archived/',
  '<rootDir>/cleanup-archive/',
  '<rootDir>/emergency-archive/',
  '<rootDir>/swissknife_old/',
  '<rootDir>/dist-test/',
  '/backup-files/',
  '/archived/',
  '/deprecated/',
  '/legacy/',
  '/superseded/',
  '\\.bak$',
  '\\.backup$',
  '\\.old$',
  '\\.orig$',
  '\\.tmp$',
  '\\.chai-bak$',
  '\\.react-bak$',
  '\\.mock-bak$',
  '\\.helper-bak$',
  '\\.import-bak$',
  '\\.bak\\.[0-9]+$',
  '.*_timeout_fixed\\.test\\.(js|ts)$',
  '.*-timeout-fixed\\.test\\.(js|ts)$',
];

const fastTestMatch = [
  '<rootDir>/test/unit/utils/array.test.ts',
  '<rootDir>/test/unit/utils/json.test.ts',
  '<rootDir>/test/unit/models/model.test.ts',
  '<rootDir>/test/unit/models/provider.test.ts',
  '<rootDir>/test/unit/utils/array-debug.test.ts',
  '<rootDir>/test/unit/utils/array-simple.test.js',
  '<rootDir>/test/unit/utils/json-simple.test.js',
  '<rootDir>/test/unit/utils/json.test.js',
  '<rootDir>/test/unit/utils/string.test.ts',
  '<rootDir>/test/unit/utils/object.test.ts',
  '<rootDir>/test/unit/utils/validation.test.ts',
  '<rootDir>/test/unit/ai/agent-simple.test.ts',
  '<rootDir>/test/unit/config-simple.test.ts',
  '<rootDir>/test/unit/tasks/task-simple.test.ts',
  '<rootDir>/test/unit/models/execution-service-fixed.test.ts',
  '<rootDir>/test/unit/commands/help-generator-fixed.test.ts',
  '<rootDir>/test/unit/utils/events/event-bus.test.ts',
  '<rootDir>/test/unit/utils/events/event-bus.test.js',
  '<rootDir>/test/unit/utils/math-utilities.test.ts',
  '<rootDir>/test/unit/utils/data-structures.test.ts',
  '<rootDir>/test/unit/utils/basic-simple.test.ts',
  '<rootDir>/test/unit/utils/comprehensive-utilities.test.ts',
  '<rootDir>/test/architecture/source-module-boundaries.test.js',
  '<rootDir>/test/mcp-plus-plus/agent-supervisor-prompt-steering.test.ts',
  '<rootDir>/test/mcp-plus-plus/wasm-prover-browser-purity.test.ts',
  '<rootDir>/test/mcp-plus-plus/dcr090-hermetic-fixtures.test.ts',
  '<rootDir>/test/mcp-plus-plus/desktop-contract-repair.e2e.test.ts',
];

const serviceTestMatch = [
  '<rootDir>/test/unit/ai/agent-simple.test.ts',
  '<rootDir>/test/unit/tasks/task-simple.test.ts',
  '<rootDir>/test/unit/models/execution-service-fixed.test.ts',
  '<rootDir>/test/unit/models/execution-service-simple.test.ts',
  '<rootDir>/test/unit/commands/help-generator-fixed.test.ts',
  '<rootDir>/test/unit/config-simple.test.ts',
];

const browserCompatStaticTestMatch = [
  '<rootDir>/test/browser-compat/**/*.test.js',
];

const e2eTestMatch = [
  '<rootDir>/test/e2e/**/*.test.js',
  '<rootDir>/test/e2e/**/*.test.ts',
];

const releaseTestMatch = [
  ...fastTestMatch,
  ...serviceTestMatch,
  ...browserCompatStaticTestMatch,
];

module.exports = {
  archivedAndBackupIgnorePatterns,
  browserCompatStaticTestMatch,
  e2eTestMatch,
  fastTestMatch,
  releaseTestMatch: Array.from(new Set(releaseTestMatch)),
  serviceTestMatch,
};
