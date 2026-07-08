// Mock global config functions
const getGlobalConfig = jest.fn().mockReturnValue({});
const saveGlobalConfig = jest.fn().mockImplementation(() => Promise.resolve());
const addApiKey = jest.fn().mockImplementation(() => Promise.resolve());
/**
 * Unit tests for the ServerRegistry component
 */

import { 
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
  getGlobalConfig,
  saveGlobalConfig,
  McpServerConfig
} from '../../src';

// Mock the config utilities
jest.mock('../../../../src/services/mcpClient', () => ({
  getCurrentProjectConfig: jest.fn(),
  saveCurrentProjectConfig: jest.fn(),
  getGlobalConfig: jest.fn(),
  saveGlobalConfig: jest.fn()
}));

// Mock the logging utilities
jest.mock('../../../../src/utils/log', () => ({
  logEvent: jest.fn(),
  logError: jest.fn()
}));

describe('ServerRegistry', () => {
  let registry: ServerRegistry;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create a new registry instance
    registry = ServerRegistry.getInstance();
    registry.clear();

    // Mock default configs
    const mockProjectConfig = {
      mcpServers: {
        'test-server': {
          type: 'stdio',
          command: 'echo',
          args: ['Hello from test server']
        }
      }
    };

    const mockGlobalConfig = {
      mcpServers: {
        'global-server': {
          type: 'sse',
          url: 'https://example.com/sse'
        }
      }
    };

    (getCurrentProjectConfig as jest.Mock).mockReturnValue(mockProjectConfig);
    (getGlobalConfig as jest.Mock).mockReturnValue(mockGlobalConfig);
  });

  it('should return the same instance (singleton pattern)', () => {
    const instance1 = ServerRegistry.getInstance();
    const instance2 = ServerRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should initialize from existing configurations', async () => {
    await registry.initialize();
    
    // Should have loaded the test server from project config
    const servers = registry.getServerNames();
    expect(servers).toContain('test-server');
    expect(servers).toContain('global-server');
    
    // Should have initialized with default versioning values
    const testServerVersions = registry.getServerVersions('test-server');
    expect(testServerVersions.length).toBe(1);
    expect(testServerVersions[0].version).toBe('1.0.0');
    expect(testServerVersions[0].status).toBe('blue');
    expect(testServerVersions[0].trafficPercentage).toBe(100);
    
    const globalServerVersions = registry.getServerVersions('global-server');
    expect(globalServerVersions.length).toBe(1);
    expect(globalServerVersions[0].version).toBe('1.0.0');
    expect(globalServerVersions[0].status).toBe('blue');
    expect(globalServerVersions[0].trafficPercentage).toBe(100);
  });

  it('should register a new server version', async () => {
    await registry.initialize();
    
    const newServerConfig: VersionedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      version: '2.0.0',
      status: 'green',
      deploymentTimestamp: Date.now(),
      trafficPercentage: 20,
      scope: 'project'
    };
    
    registry.registerServer('test-server', newServerConfig);
    
    // Should now have two versions of test-server
    const versions = registry.getServerVersions('test-server');
    expect(versions.length).toBe(2);
    
    // Check the new version was registered correctly
    const newVersion = registry.getServerVersion('test-server', '2.0.0');
    expect(newVersion).toBeDefined();
    expect(newVersion!.version).toBe('2.0.0');
    expect(newVersion!.status).toBe('green');
    expect(newVersion!.trafficPercentage).toBe(20);
    
    // Verify the original blue version was kept
    const blueVersion = registry.getBlueVersion('test-server');
    expect(blueVersion).toBeDefined();
    expect(blueVersion!.version).toBe('1.0.0');
    
    // Verify it was saved to config
    expect(saveCurrentProjectConfig).toHaveBeenCalled();
  });

  it('should only allow one blue version per server', async () => {
    await registry.initialize();
    
    // Register a new blue version
    const newBlueConfig: VersionedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      version: '2.0.0',
      status: 'blue',
      deploymentTimestamp: Date.now(),
      trafficPercentage: 100,
      scope: 'project'
    };
    
    registry.registerServer('test-server', newBlueConfig);
    
    // Check old version is no longer blue
    const oldVersion = registry.getServerVersion('test-server', '1.0.0');
    expect(oldVersion).toBeDefined();
    expect(oldVersion!.status).toBe('inactive');
    expect(oldVersion!.trafficPercentage).toBe(0);
    
    // Check new version is blue
    const newVersion = registry.getServerVersion('test-server', '2.0.0');
    expect(newVersion).toBeDefined();
    expect(newVersion!.status).toBe('blue');
    expect(newVersion!.trafficPercentage).toBe(100);
    
    // Should only have one blue version
    const blueVersion = registry.getBlueVersion('test-server');
    expect(blueVersion).toBeDefined();
    expect(blueVersion!.version).toBe('2.0.0');
  });

  it('should validate traffic percentages sum to 100', async () => {
    await registry.initialize();
    
    // Register a green version with 30% traffic
    const greenConfig: VersionedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      version: '2.0.0',
      status: 'green',
      deploymentTimestamp: Date.now(),
      trafficPercentage: 30,
      scope: 'project'
    };
    
    registry.registerServer('test-server', greenConfig);
    
    // Both versions should exist
    const versions = registry.getActiveServerVersions('test-server');
    expect(versions.length).toBe(2);
    
    // Traffic should sum to 100
    const totalTraffic = versions.reduce((sum, v) => sum + v.trafficPercentage, 0);
    expect(totalTraffic).toBe(100);
    
    // Original blue version should now have 70% traffic
    const blueVersion = registry.getBlueVersion('test-server');
    expect(blueVersion).toBeDefined();
    expect(blueVersion!.trafficPercentage).toBe(70);
  });

  it('should update server status correctly', async () => {
    await registry.initialize();
    
    // Register a green version
    const greenConfig: VersionedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      version: '2.0.0',
      status: 'green',
      deploymentTimestamp: Date.now(),
      trafficPercentage: 30,
      scope: 'project'
    };
    
    registry.registerServer('test-server', greenConfig);
    
    // Promote it to blue
    const updateResult = registry.updateServerStatus('test-server', '2.0.0', 'blue');
    expect(updateResult).toBe(true);
    
    // Original version should no longer be blue
    const originalVersion = registry.getServerVersion('test-server', '1.0.0');
    expect(originalVersion!.status).toBe('inactive');
    
    // New version should be blue
    const newVersion = registry.getServerVersion('test-server', '2.0.0');
    expect(newVersion!.status).toBe('blue');
    
    // Should have 100% traffic
    expect(newVersion!.trafficPercentage).toBe(100);
  });

  it('should update traffic percentages correctly', async () => {
    await registry.initialize();
    
    // Register a green version
    const greenConfig: VersionedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      version: '2.0.0',
      status: 'green',
      deploymentTimestamp: Date.now(),
      trafficPercentage: 0, // Start with 0% traffic
      scope: 'project'
    };
    
    registry.registerServer('test-server', greenConfig);
    
    // Update its traffic percentage
    const updateResult = registry.updateTrafficPercentage('test-server', '2.0.0', 50);
    expect(updateResult).toBe(true);
    
    // Check it has 50% traffic
    const greenVersion = registry.getServerVersion('test-server', '2.0.0');
    expect(greenVersion!.trafficPercentage).toBe(50);
    
    // Blue version should have 50% traffic
    const blueVersion = registry.getBlueVersion('test-server');
    expect(blueVersion!.trafficPercentage).toBe(50);
    
    // Traffic should sum to 100
    const versions = registry.getActiveServerVersions('test-server');
    const totalTraffic = versions.reduce((sum, v) => sum + v.trafficPercentage, 0);
    expect(totalTraffic).toBe(100);
  });

  it('should record health check results', async () => {
    await registry.initialize();
    
    // Record a failed health check
    registry.recordHealthCheck('test-server', '1.0.0', false);
    
    // Check health status
    const status = registry.getHealthStatus('test-server', '1.0.0');
    expect(status).toBeDefined();
    expect(status!.isHealthy).toBe(false);
    expect(status!.lastCheck).toBeGreaterThan(0);
    
    // Record a successful check
    registry.recordHealthCheck('test-server', '1.0.0', true);
    
    // Health should now be good
    const updatedStatus = registry.getHealthStatus('test-server', '1.0.0');
    expect(updatedStatus!.isHealthy).toBe(true);
  });

  it('should record rollback events', async () => {
    await registry.initialize();
    
    // Register a green version
    const greenConfig: VersionedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      version: '2.0.0',
      status: 'green',
      deploymentTimestamp: Date.now(),
      trafficPercentage: 30,
      scope: 'project'
    };
    
    registry.registerServer('test-server', greenConfig);
    
    // Mock project config with version history
    const mockProjectConfig = {
      mcpServers: {
        'test-server': { type: 'stdio', command: 'echo', args: ['test'] }
      },
      mcpVersionHistory: {}
    };
    (getCurrentProjectConfig as jest.Mock).mockReturnValue(mockProjectConfig);
    
    // Record a rollback
    registry.recordRollback(
      'test-server',
      '2.0.0',
      '1.0.0',
      'Health check failed'
    );
    
    // Check rollback was saved
    expect(saveCurrentProjectConfig).toHaveBeenCalled();
    
    // Capture the config that was saved
    const savedConfig = (saveCurrentProjectConfig as jest.Mock).mock.calls[0][0];
    expect(savedConfig.mcpVersionHistory['test-server']).toBeDefined();
    expect(savedConfig.mcpVersionHistory['test-server'].lastRollback).toBeDefined();
    expect(savedConfig.mcpVersionHistory['test-server'].lastRollback.fromVersion).toBe('2.0.0');
    expect(savedConfig.mcpVersionHistory['test-server'].lastRollback.toVersion).toBe('1.0.0');
    expect(savedConfig.mcpVersionHistory['test-server'].lastRollback.reason).toBe('Health check failed');
  });
});