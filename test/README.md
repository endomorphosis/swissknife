# SwissKnife Testing Framework

This document provides an overview of the comprehensive testing framework created for the SwissKnife project, covering all phases from Phase 1 through Phase 5.

## Overview

The SwissKnife testing framework is designed to support comprehensive testing of all components in the system, from individual units to full end-to-end workflows across all project phases. It provides mock implementations, fixtures, utilities, and benchmarks to make testing easier, more consistent, and capable of tracking performance.

## Directory Structure

```
/test
├── unit/                  # Unit tests for individual components
│   ├── phase1/            # Phase 1: Configuration and Command Registry
│   ├── phase2/            # Phase 2: AI Agent, Task System, Storage System
│   ├── phase3/            # Phase 3: TaskNet enhancements
│   ├── phase4/            # Phase 4: CLI integration components
│   ├── performance/       # Phase 5: Performance optimization
│   ├── release/           # Phase 5: Release management
│   ├── testing/           # Phase 5: Testing framework
│   ├── documentation/     # Phase 5: Documentation generation
│   ├── ux/                # Phase 5: UX enhancements
│   ├── cli/               # CLI-specific components
│   └── tasknet/           # TaskNet trace-based tests
│
├── integration/           # Integration tests between components
│   ├── phase1/            # Phase 1: Configuration-Command integration
│   ├── phase2/            # Phase 2: Agent-Task-Storage integration
│   ├── phase3/            # Phase 3: TaskNet integration
│   ├── phase4/            # Phase 4: Cross-component integration
│   ├── phase5.test.ts     # Phase 5: Integration tests
│   └── ai-storage/        # AI and storage integration
│
├── e2e/                   # End-to-end workflow tests
│   ├── cli/               # CLI workflow tests by phase
│   │   ├── phase1-commands.test.js  # Phase 1 CLI tests
│   │   ├── phase2-commands.test.js  # Phase 2 CLI tests
│   │   ├── phase3-commands.test.js  # Phase 3 CLI tests
│   │   └── phase4-commands.test.js  # Phase 4 CLI tests
│   ├── cli-workflows/     # CLI workflow tests
│   ├── task-execution/    # Complete task execution workflows
│   ├── platform-specific.test.js    # Platform-specific tests
│   └── all-phases.test.js # Comprehensive E2E tests across all phases
│
├── benchmark/             # Performance benchmarks
│   ├── phase1.benchmark.ts # Configuration and Command Registry
│   ├── phase2.benchmark.ts # AI, Task, Storage components
│   ├── phase3.benchmark.ts # TaskNet components
│   ├── phase4.benchmark.ts # CLI integration components
│   ├── phase5.benchmark.ts # Performance optimization
│   ├── collect-results.js  # Script to collect benchmark results
│   └── README.md           # Benchmark documentation
│
├── mocks/                 # Mock implementations for testing
│   ├── bridges/           # Mock integration bridges
│   ├── services/          # Mock services
│   ├── models/            # Mock model providers
│   ├── workers/           # Mock worker threads
│   ├── config/            # Mock configuration
│   ├── tasks/             # Mock task system
│   └── graph/             # Mock Graph-of-Thought system
│
├── fixtures/              # Test data fixtures
│   ├── commands/          # Command test data
│   ├── config/            # Configuration test data
│   ├── tasks/             # Task test data
│   └── models/            # Model test data
│
├── utils/                 # Test utilities
│   ├── test-helpers.js    # Common test helper functions
│   ├── cli-runner.js      # CLI execution utilities
│   └── setup.js           # Test environment setup
│
└── examples/              # Example tests showcasing the framework
    ├── complex-workflow.test.js        # Example of a complex workflow test
    ├── worker-task-integration.test.js # Example of worker-task integration
    ├── cli-workflow-e2e.test.js        # Example of CLI end-to-end test
    └── graph/                          # Graph-of-Thought examples
        └── graph-of-thought.test.js    # Example of GoT system testing
```

## Key Components

### Mock Implementations

Mock implementations provide replacements for real system components, allowing isolated testing:

- **Bridges**: Mock implementations of integration bridges between components (`mock-bridge.js`, `specific-bridges.js`)
- **Models**: Mock implementations of models and providers (`mock-models.js`)
- **Workers**: Mock implementation of workers and worker pools (`mock-workers.js`)
- **Config**: Mock implementation of configuration system (`mock-config.js`)
- **Tasks**: Mock implementation of task system (`mock-tasks.js`)
- **Services**: Mock implementations of various services (`mock-services.js`)
- **Graph**: Mock implementation of Graph-of-Thought system (`mock-graph-of-thought.js`)
- **IPFS**: Mock implementation of IPFS storage system (`mock-ipfs.js`)
- **AI Agents**: Mock AI agent implementations for testing (`mock-agent.js`)
- **Scheduler**: Mock scheduler implementations (`enhanced-fibonacci-heap.js`)
- **MerkleClock**: Mock implementation of Merkle clock for testing consistency (`mock-merkle.js`)

### Test Fixtures

Fixtures provide standardized test data for tests:

- **Commands**: Sample command definitions and execution contexts (`commands.js`)
- **Config**: Sample configuration data and schemas (`config.js`)
- **Tasks**: Sample task definitions and instances (`tasks.js`)
- **Models**: Sample models, providers, and responses (`models.js`)

### Test Utilities

Utilities provide helper functions for common testing operations:

- **Test Helpers**: Common test utilities like wait functions, mocking helpers (`test-helpers.js`)
- **CLI Runner**: Utility for running and testing CLI commands (`cli-runner.js`)
- **Setup**: Utilities for setting up test environments (`setup.js`)

### Example Tests

Example tests demonstrate how to use the framework for different testing scenarios:

- **Complex Workflow**: Testing a workflow involving multiple components
- **Worker-Task Integration**: Testing interaction between worker and task systems
- **CLI End-to-End**: Testing complete CLI workflows
- **Graph-of-Thought**: Testing the Graph-of-Thought reasoning system

## Active Test Lanes

The active gates are documented in [TEST_LANES.md](./TEST_LANES.md). They are
the scripts CI and release automation should use:

```bash
npm test                         # Default fast lane
npm run test:fast                # Curated deterministic unit gate
npm run test:service             # Stable service-level gate
npm run test:browser-compat      # Static + mocked DOM runtime gate
npm run test:e2e                 # Jest E2E lane
npm run test:e2e:mcp             # MCP dashboard Playwright/consumer lane
npm run test:release             # Fast + service + browser-compat + E2E/MCP

# Run specific benchmarks
npm run test:benchmark:phase1  # Phase 1 benchmarks
npm run test:benchmark:phase2  # Phase 2 benchmarks
npm run test:benchmark:phase3  # Phase 3 benchmarks
npm run test:benchmark:phase4  # Phase 4 benchmarks
npm run test:benchmark:phase5  # Phase 5 benchmarks
npm run test:benchmark:all     # All benchmarks

# Code coverage
npm run test:coverage     # Generate code coverage report
```

Archived configs and backup/debug tests are intentionally excluded from active
lanes. Keep new gate membership in `config/jest/test-lanes.cjs` or the relevant
Vitest config under `build-tools/configs/` so test discovery stays deterministic.

## Documentation Links

For more detailed information about the testing framework:

- [Testing Framework Guide](/docs/phase5/testing_framework_guide.md) - Comprehensive guide
- [Benchmark Quick Reference](/docs/phase5/benchmark_quick_reference.md) - Guide to performance testing
- [Testing Framework Documentation](/docs/phase5/testing_framework.md) - Technical documentation

## How to Use

### Setting Up a Test Environment

Use the `createTestEnvironment` function from `test/utils/setup.js` to create a complete test environment with all necessary mocks:

```javascript
const { createTestEnvironment, setupGlobalMocks } = require('../utils/setup');

// Create test environment with options
const env = createTestEnvironment({
  // Use custom configuration
  config: { 
    models: { default: 'gpt-4' } 
  },
  // Register specific providers
  providers: [sampleProviders.openai],
  // Configure task processing
  taskErrorRate: 0.2,
  taskProcessingTime: 100
});

// Optionally set up global mocks
const cleanup = setupGlobalMocks(env);

// When finished
if (cleanup) cleanup();
```

### Using Mock Components

Mock components can be used directly in tests:

```javascript
const { MockTaskManager } = require('../../mocks/tasks/mock-tasks');
const { MockWorkerPool } = require('../../mocks/workers/mock-workers');

// Create mock components
const taskManager = new MockTaskManager();
const workerPool = new MockWorkerPool({ size: 2 });

// Use the mocks in tests
await workerPool.initialize();
const taskId = await taskManager.createTask('echo', { message: 'Test' });
await taskManager.executeTask(taskId);

// Verify mock behavior
expect(taskManager.createCalls).toHaveLength(1);
expect(taskManager.executeCalls).toHaveLength(1);
```

### Using Test Fixtures

Fixtures provide standard test data:

```javascript
const { sampleCommands } = require('../../fixtures/commands/commands');
const { sampleConfigurations } = require('../../fixtures/config/config');

// Use sample command in tests
const command = sampleCommands.withOptions;
expect(command.options).toHaveLength(3);

// Use sample configuration in tests
const config = sampleConfigurations.basic;
expect(config.models.default).toBe('gpt-4');
```

### Using Test Utilities

Utilities provide helper functions for tests:

```javascript
const { wait, waitForCondition } = require('../../utils/test-helpers');
const { CLIRunner } = require('../../utils/cli-runner');

// Wait for async operations
await wait(100);

// Wait for a condition
const ready = await waitForCondition(() => service.isReady());

// Run CLI commands
const cliRunner = new CLIRunner();
const result = await cliRunner.run('help');
expect(result.exitCode).toBe(0);
```

## Testing Best Practices

1. **Use Mocks for Isolation**: Use mock implementations to isolate components during testing.
2. **Test at All Levels**: Write unit, integration, and end-to-end tests as appropriate.
3. **Use Fixtures for Consistency**: Use test fixtures for standardized test data.
4. **Make Tests Deterministic**: Avoid relying on external services or random behavior.
5. **Test Error Paths**: Test how components handle errors, not just the happy path.
6. **Keep Tests Fast**: Tests should run quickly, especially unit and integration tests.
7. **Use Clear Assertions**: Each test should have clear and specific assertions.
8. **Use Descriptive Names**: Test and describe blocks should clearly indicate what they test.

## Running Tests

Use the scripts in `package.json` to run tests:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only end-to-end tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch

# Run platform-specific tests
npm run test:platform

# Run trace-based tests for TaskNet
npm run test:trace

# Benchmark tools
npm run benchmark:collect     # Collect benchmark results to a JSON file
npm run benchmark:compare     # Compare benchmark results and detect regressions
```

## Advanced Testing Features

### Event Tracing Framework

The event tracing framework (`/test/utils/event-tracer.ts`) enables sophisticated testing of complex asynchronous workflows, particularly in TaskNet components. It records and validates event sequences, making it easy to verify that components interact correctly in complex scenarios.

Example usage:

```typescript
import { TaskNetTracer } from '../utils/event-tracer';

// Create a tracer
const tracer = new TaskNetTracer();
tracer.startRecording();

// Record events during component execution
tracer.recordTaskCreation('task-123', taskData);
await taskManager.executeTask('task-123');
tracer.recordTaskCompletion('task-123', result);

// Validate event sequences
expect(tracer.hasSequence([
  'task:created',
  'TaskManager:executeTask:called',
  'task:completed'
])).toBe(true);
```

### Platform-Specific Testing

Platform-specific tests verify that SwissKnife works correctly across different operating systems. These tests automatically detect the current platform and run the appropriate test suite.

Key aspects tested:
- Path handling differences
- File system case sensitivity
- Environment variable handling
- Configuration directory locations
- Line ending differences

For more detailed information about these advanced features, see:
- [Advanced Testing Features](/docs/phase5/advanced_testing_features.md)

## Continuous Integration

Tests are automatically run on CI using GitHub Actions whenever code is pushed or a pull request is opened against the main branch. See `.github/workflows/test.yml` for details.
