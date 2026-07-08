// Jest global setup for SwissKnife tests

// Removed explicit import of 'jest' to avoid "already declared" errors.
// Jest's global 'jest' object should be available automatically.

// Mock common problematic modules that frequently cause issues
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // Import and retain default behavior
  existsSync: jest.fn(),
  mkdtempSync: jest.fn((prefix, options) => require('fs').mkdtempSync(prefix, options)), // Use actual implementation
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rmdirSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'), // Import and retain default behavior
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  rm: jest.fn(),
}));

jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn((fn) => fn), // Mock promisify to return the function itself
}));

jest.mock('chalk', () => {
  const actualChalk = jest.requireActual('chalk');
  return {
    __esModule: true, // This is important for ESM compatibility
    default: actualChalk.default || ((str) => str), // Use actual default if available, otherwise fallback
    ...actualChalk, // Spread all other exports from actual chalk
    red: actualChalk.red || ((str) => str),
    green: actualChalk.green || ((str) => str),
    blue: actualChalk.blue || ((str) => str),
    bold: actualChalk.bold || ((str) => str),
    cyan: actualChalk.cyan || ((str) => str),
    yellow: actualChalk.yellow || ((str) => str),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    stop: jest.fn(),
  })),
}));

jest.mock('ink', () => ({
  Box: 'Box',
  Text: 'Text',
}));


jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn((initial) => [initial, jest.fn()]),
  useEffect: jest.fn(),
  useRef: jest.fn(() => ({ current: null })),
}));

jest.mock('zod', () => ({
  z: {
    string: jest.fn(() => ({
      optional: jest.fn(),
      describe: jest.fn(),
      default: jest.fn(),
      array: jest.fn(),
    })),
    boolean: jest.fn(() => ({
      optional: jest.fn(),
      describe: jest.fn(),
      default: jest.fn(),
    })),
    number: jest.fn(() => ({
      optional: jest.fn(),
      describe: jest.fn(),
      default: jest.fn(),
    })),
    object: jest.fn(() => ({
      passthrough: jest.fn(),
    })),
    enum: jest.fn(() => ({
      optional: jest.fn(),
    })),
    any: jest.fn(),
  },
}));

try {
  jest.mock('merkletreejs', () => ({
    MerkleTree: jest.fn().mockImplementation(() => ({
      getRoot: jest.fn(() => 'mock-root'),
      getHexLayers: jest.fn(() => ['mock-layer']),
    })),
  }));
} catch (e) {
  // merkletreejs not available, skip mock
}

jest.mock('axios', () => ({
  default: {
    create: jest.fn(() => ({
      post: jest.fn(() => Promise.resolve({ data: {} })),
      get: jest.fn(() => Promise.resolve({ data: {} })),
    })),
  },
}));

jest.mock('commander', () => ({
  Command: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    helpInformation: jest.fn(),
    opts: jest.fn(() => ({})),
    args: [],
    commands: [],
    options: [],
  })),
}));

// Mock specific internal modules that are frequently causing ReferenceErrors
jest.mock('@src/models/execution/service', () => ({
  ModelExecutionService: {
    getInstance: jest.fn().mockReturnValue({
      executeModel: jest.fn(),
      emit: jest.fn(),
      getExecutionStats: jest.fn(),
    }),
  },
}));

beforeAll(async () => {
  jest.doMock('../src/utils/merkle-clock', () => ({
    MerkleClock: jest.fn().mockImplementation(() => ({
      increment: jest.fn(),
      merge: jest.fn(),
      getHash: jest.fn(),
    })),
  }));
});

// jest.mock('@src/tasks/scheduler/fibonacci-heap-scheduler', () => ({
//   FibonacciHeapScheduler: jest.fn().mockImplementation(() => ({
//     addTask: jest.fn(),
//     getNextTask: jest.fn(),
//     updateTaskPriority: jest.fn(),
//     removeTask: jest.fn(),
//     isEmpty: jest.fn(),
//   })),
// }));

jest.mock('@src/ai/thinking/graph', () => ({
  GraphOfThought: jest.fn().mockImplementation(() => ({
    addNode: jest.fn(),
    addEdge: jest.fn(),
    traverse: jest.fn(),
  })),
}));

jest.mock('@src/tasks/registry', () => ({
  TaskRegistry: {
    getInstance: jest.fn().mockReturnValue({
      registerTask: jest.fn(),
      getTaskDefinition: jest.fn(),
      getAllTaskDefinitions: jest.fn(),
      validateTaskData: jest.fn(),
      isTaskTypeRegistered: jest.fn(),
    }),
  },
}));

jest.mock('@src/release/packager', () => ({
  ReleasePackager: jest.fn().mockImplementation(() => ({
    packageForLinux: jest.fn(),
    packageForMacOS: jest.fn(),
    packageForWindows: jest.fn(),
    createPackages: jest.fn(),
  })),
}));

jest.mock('@src/ai/models/model', () => ({
  Model: jest.fn().mockImplementation(() => ({
    generate: jest.fn(),
  })),
}));

jest.mock('../src/ai/agent/agent', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    processMessage: jest.fn(),
  })),
}));

jest.mock('@src/tasks/manager', () => ({
  TaskManager: jest.fn().mockImplementation(() => ({
    createTask: jest.fn(),
  })),
}));

jest.mock('@src/ipfs/client', () => ({
  IPFSKitClient: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('@src/services/mcpClient', () => ({
  addMcpServer: jest.fn(),
  removeMcpServer: jest.fn(),
  getClients: jest.fn(),
  getMCPTools: jest.fn(),
}));

// Commented out non-existent config manager mock
// jest.mock('@src/utils/config/manager', () => ({
//   ConfigManager: {
//     getInstance: jest.fn().mockReturnValue({
//       get: jest.fn(),
//       set: jest.fn(),
//       initialize: jest.fn(),
//       registerSchema: jest.fn(),
//     }),
//   },
// }));

jest.mock('@src/ai/tools/executor', () => ({
  ToolExecutor: jest.fn().mockImplementation(() => ({
    execute: jest.fn(),
  })),
}));

jest.mock('@src/ai/thinking/manager', () => ({
  ThinkingManager: jest.fn().mockImplementation(() => ({
    processThought: jest.fn(),
  })),
}));

jest.mock('@src/utils/logging/log-manager', () => ({
  LogManager: {
    getInstance: jest.fn().mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      setLogLevel: jest.fn(),
      enableTransport: jest.fn(),
      disableTransport: jest.fn(),
      isLogLevelEnabled: jest.fn(),
    }),
  },
}));

jest.mock('@src/storage/factory', () => ({
  StorageFactory: {
    createStorage: jest.fn(),
  },
}));

jest.mock('@src/tasks/decomposition', () => ({
  TaskDecomposer: jest.fn().mockImplementation(() => ({
    decompose: jest.fn(),
  })),
}));

jest.mock('@src/tasks/synthesis', () => ({
  TaskSynthesizer: jest.fn().mockImplementation(() => ({
    synthesize: jest.fn(),
  })),
}));

jest.mock('@src/utils/state', () => ({
  setCwd: jest.fn(),
  getCwd: jest.fn(() => '/mock/cwd'),
}));

jest.mock('@src/utils/encryption', () => ({
  encrypt: jest.fn((data) => `encrypted-${data}`),
  decrypt: jest.fn((data) => data.replace('encrypted-', '')),
}));

jest.mock('@src/services/registry', () => ({
  ServiceRegistry: {
    getInstance: jest.fn().mockReturnValue({
      register: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
    }),
  },
}));

jest.mock('@src/testing/test-runner', () => ({
  TestRunner: jest.fn().mockImplementation(() => ({
    runUnitTests: jest.fn(),
    runIntegrationTests: jest.fn(),
    runE2ETests: jest.fn(),
    runAllTests: jest.fn(),
  })),
}));

jest.mock('../src/cli/commands/taskCommand', () => ({
  TaskCommand: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    helpInformation: jest.fn(),
    opts: jest.fn(() => ({})),
    args: [],
    commands: [],
    options: [],
  })),
}));

jest.mock('@src/cli/commands/ipfsCommand', () => ({
  IPFSCommand: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    helpInformation: jest.fn(),
    opts: jest.fn(() => ({})),
    args: [],
    commands: [],
    options: [],
  })),
}));

jest.mock('@src/cli/commands/agentCommand', () => ({
  AgentCommand: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    helpInformation: jest.fn(),
    opts: jest.fn(() => ({})),
    args: [],
    commands: [],
    options: [],
  })),
}));

jest.mock('@src/cli/integration/crossIntegration', () => ({
  CrossIntegration: jest.fn().mockImplementation(() => ({
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    helpInformation: jest.fn(),
    opts: jest.fn(() => ({})),
    args: [],
    commands: [],
    options: [],
  })),
}));

// jest.mock('@src/tasks/coordination/responsibility', () => ({
//   normalizeId: jest.fn((id) => id),
//   calculateHammingDistance: jest.fn(() => 0),
//   determineResponsibility: jest.fn(),
// }));

jest.mock('@src/tasks/coordination/merkle_clock', () => ({
  MerkleClock: jest.fn().mockImplementation(() => ({
    increment: jest.fn(),
    merge: jest.fn(),
    getHash: jest.fn(),
  })),
}));

jest.mock('@src/tasks/scheduler/fibonacci-heap-scheduler', () => ({
  FibonacciHeapScheduler: jest.fn().mockImplementation(() => ({
    addTask: jest.fn(),
    getNextTask: jest.fn(),
    updateTaskPriority: jest.fn(),
    removeTask: jest.fn(),
    isEmpty: jest.fn(),
  })),
}));

jest.mock('@src/tools/BashTool/BashTool', () => ({
  BashTool: jest.fn().mockImplementation(() => ({
    name: 'bash',
    description: 'Execute bash commands',
    schema: {},
    call: jest.fn(),
  })),
}));

jest.mock('@src/tools/MCPTool/MCPTool', () => ({
  MCPTool: jest.fn().mockImplementation(() => ({
    name: 'mcp',
    description: 'Interact with MCP servers',
    schema: {},
    call: jest.fn(),
  })),
}));

jest.mock('@src/services/mcp/mcp-transport', () => ({
  MCPTransportFactory: {
    create: jest.fn().mockImplementation((options) => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
      receive: jest.fn(),
      getType: jest.fn(() => options.type),
      isConnected: jest.fn(() => false),
    })),
  },
  MCPClient: jest.fn().mockImplementation(() => ({
    request: jest.fn(),
  })),
}));
