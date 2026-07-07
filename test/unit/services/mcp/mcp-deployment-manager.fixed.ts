// Mock global config functions
const getGlobalConfig = jest.fn().mockReturnValue({});
const saveGlobalConfig = jest.fn().mockImplementation(() => Promise.resolve());
const addApiKey = jest.fn().mockImplementation(() => Promise.resolve());
/**
 * Unit tests for the DeploymentManager component
 */

import { DeploymentManager } from '../../../../src/services/mcp/mcp-deployment-manager.js';
import { ServerRegistry } from '../../../../src/services/mcp/mcp-registry.js';
import { VersionedServerConfig } from '../../../../src/services/mcp/mcp-types.js';

// Mock the registry
jest.mock('../../../../src/services/mcp/mcp-registry.js', () => {
  const mockServerRegistry = {
    initialize: jest.fn().mockResolvedValue(undefined),
    registerServer: jest.fn(),
    getServerVersion: jest.fn(),
    getBlueVersion: jest.fn(),
    updateServerStatus: jest.fn().mockReturnValue(true),
    updateTrafficPercentage: jest.fn().mockReturnValue(true),
    getServerVersions: jest.fn(),
    getVersionHistory: jest.fn(),
    recordRollback: jest.fn(),
    removeServerVersion: jest.fn(),
    getRollbackHistory: jest.fn(),
    getHealthStatus: jest.fn().mockReturnValue({
      isHealthy: true,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 3,
    }),
    on: jest.fn(),
    emit: jest.fn(),
  };
  
  return {
    ServerRegistry: {
      getInstance: jest.fn().mockReturnValue(mockServerRegistry)
    }
  };
});

// Mock config utilities
const getCurrentProjectConfig = jest.fn().mockReturnValue({ mcpServers: {} });
const getGlobalConfig = jest.fn().mockReturnValue({ mcpServers: {} });
const getMcprcConfig = jest.fn().mockReturnValue({});

jest.mock('../../../../src/utils/config.js', () => ({
  getCurrentProjectConfig: jest.fn().mockImplementation(() => getCurrentProjectConfig()),
  getGlobalConfig: jest.fn().mockImplementation(() => getGlobalConfig()),
  getMcprcConfig: jest.fn().mockImplementation(() => getMcprcConfig()),
}));

// Mock logging
jest.mock('../../../../src/utils/log.js', () => ({
  logEvent: jest.fn(),
  logError: jest.fn(),
}));

describe('DeploymentManager', () => {
  let deploymentManager: DeploymentManager;
  let mockRegistry: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get singleton instance
    deploymentManager = DeploymentManager.getInstance();
    mockRegistry = ServerRegistry.getInstance();
  });
  
  it('should return the same instance (singleton pattern)', () => {
    const instance1 = DeploymentManager.getInstance();
    const instance2 = DeploymentManager.getInstance();
    expect(instance1).toBe(instance2);
  });
  
  it('should initialize and ensure registry is initialized', async () => {
    await deploymentManager.initialize();
    
    expect(mockRegistry.initialize).toHaveBeenCalled();
  });
  
  describe('deployVersion', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should deploy a new version as green with 0% traffic by default', async () => {
      // Mock registry responses
      mockRegistry.getServerVersion.mockReturnValue(undefined); // Version doesn't exist yet
      
      // Deploy the version
      const result = await deploymentManager.deployVersion(
        'test-server',
        '1.0.0',
        {
          type: 'stdio',
          command: 'echo',
          args: ['test'],
        }
      );
      
      expect(result).toBe(true);
      
      // Check registry calls
      expect(mockRegistry.registerServer).toHaveBeenCalledWith(
        'test-server',
        expect.objectContaining({
          type: 'stdio',
          command: 'echo',
          args: ['test'],
          version: '1.0.0',
          status: 'green',
          trafficPercentage: 0,
        })
      );
    });
    
    it('should deploy with custom options when provided', async () => {
      // Mock registry responses
      mockRegistry.getServerVersion.mockReturnValue(undefined); // Version doesn't exist yet
      
      // Deploy with custom options
      const result = await deploymentManager.deployVersion(
        'test-server',
        '2.0.0',
        {
          type: 'sse',
          url: 'https://example.com/events',
        },
        {
          initialStatus: 'blue',
          initialTrafficPercentage: 100,
          scope: 'global',
          metadata: { description: 'Test version' },
        }
      );
      
      expect(result).toBe(true);
      
      // Check registry calls
      expect(mockRegistry.registerServer).toHaveBeenCalledWith(
        'test-server',
        expect.objectContaining({
          type: 'sse',
          url: 'https://example.com/events',
          version: '2.0.0',
          status: 'blue',
          trafficPercentage: 100,
          scope: 'global',
          metadata: { description: 'Test version' },
        })
      );
    });
    
    it('should demote existing blue version when deploying a new blue version', async () => {
      // Mock existing blue version
      const existingBlue = {
        version: '1.0.0',
        status: 'blue',
      };
      
      mockRegistry.getServerVersion.mockReturnValue(undefined); // New version doesn't exist yet
      mockRegistry.getBlueVersion.mockReturnValue(existingBlue);
      
      // Deploy new blue version
      await deploymentManager.deployVersion(
        'test-server',
        '2.0.0',
        {
          type: 'stdio',
          command: 'echo',
          args: ['test'],
        },
        {
          initialStatus: 'blue',
        }
      );
      
      // Check that existing blue was demoted
      expect(mockRegistry.updateServerStatus).toHaveBeenCalledWith(
        'test-server',
        '1.0.0',
        'inactive'
      );
    });
    
    it('should validate version format', async () => {
      await expect(
        deploymentManager.deployVersion(
          'test-server',
          'invalid-version',
          {
            type: 'stdio',
            command: 'echo',
            args: ['test'],
          }
        )
      ).rejects.toThrow('Invalid version format');
    });
    
    it('should reject if version already exists', async () => {
      // Mock existing version
      mockRegistry.getServerVersion.mockReturnValue({
        version: '1.0.0',
        status: 'blue',
      });
      
      await expect(
        deploymentManager.deployVersion(
          'test-server',
          '1.0.0',
          {
            type: 'stdio',
            command: 'echo',
            args: ['test'],
          }
        )
      ).rejects.toThrow('already exists');
    });
  });
  
  describe('promoteToBlue', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should promote a version to blue and give it 100% traffic', async () => {
      // Mock version
      mockRegistry.getServerVersion.mockReturnValue({
        version: '1.0.0',
        status: 'green',
        trafficPercentage: 30,
      });
      
      // Promote to blue
      const result = await deploymentManager.promoteToBlue('test-server', '1.0.0');
      
      expect(result).toBe(true);
      
      // Check registry calls
      expect(mockRegistry.updateServerStatus).toHaveBeenCalledWith(
        'test-server',
        '1.0.0',
        'blue'
      );
      
      expect(mockRegistry.updateTrafficPercentage).toHaveBeenCalledWith(
        'test-server',
        '1.0.0',
        100
      );
    });
    
    it('should do nothing if version is already blue', async () => {
      // Mock already blue version
      mockRegistry.getServerVersion.mockReturnValue({
        version: '1.0.0',
        status: 'blue',
        trafficPercentage: 100,
      });
      
      // Promote to blue
      const result = await deploymentManager.promoteToBlue('test-server', '1.0.0');
      
      expect(result).toBe(true);
      
      // Should not update status again
      expect(mockRegistry.updateServerStatus).not.toHaveBeenCalled();
    });
    
    it('should throw if version does not exist', async () => {
      mockRegistry.getServerVersion.mockReturnValue(undefined);
      
      await expect(
        deploymentManager.promoteToBlue('test-server', '1.0.0')
      ).rejects.toThrow('not found');
    });
  });
  
  describe('rollback', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should roll back from problematic version to blue version', async () => {
      // Mock versions
      mockRegistry.getServerVersion.mockReturnValue({
        version: '2.0.0',
        status: 'green',
        trafficPercentage: 30,
      });
      
      mockRegistry.getBlueVersion.mockReturnValue({
        version: '1.0.0',
        status: 'blue',
        trafficPercentage: 70,
      });
      
      // Perform rollback
      const result = await deploymentManager.rollback(
        'test-server',
        '2.0.0',
        'Test failure'
      );
      
      expect(result).toBe(true);
      
      // Check registry calls
      expect(mockRegistry.updateServerStatus).toHaveBeenCalledWith(
        'test-server',
        '2.0.0',
        'inactive'
      );
      
      expect(mockRegistry.updateTrafficPercentage).toHaveBeenCalledWith(
        'test-server',
        '2.0.0',
        0
      );
      
      expect(mockRegistry.updateTrafficPercentage).toHaveBeenCalledWith(
        'test-server',
        '1.0.0',
        100
      );
      
      expect(mockRegistry.recordRollback).toHaveBeenCalledWith(
        'test-server',
        '2.0.0',
        '1.0.0',
        'Test failure'
      );
    });
    
    it('should throw if no blue version exists', async () => {
      mockRegistry.getServerVersion.mockReturnValue({
        version: '2.0.0',
        status: 'green',
        trafficPercentage: 100,
      });
      
      mockRegistry.getBlueVersion.mockReturnValue(undefined);
      
      await expect(
        deploymentManager.rollback('test-server', '2.0.0', 'Test failure')
      ).rejects.toThrow('No blue version found');
    });
    
    it('should throw if trying to roll back the blue version', async () => {
      const blueVersion = {
        version: '1.0.0',
        status: 'blue',
        trafficPercentage: 100,
      };
      
      mockRegistry.getServerVersion.mockReturnValue(blueVersion);
      mockRegistry.getBlueVersion.mockReturnValue(blueVersion);
      
      await expect(
        deploymentManager.rollback('test-server', '1.0.0', 'Test failure')
      ).rejects.toThrow('Cannot roll back from blue version');
    });
  });
  
  describe('setTrafficPercentage', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should update traffic percentage', async () => {
      mockRegistry.getServerVersion.mockReturnValue({
        version: '2.0.0',
        status: 'green',
        trafficPercentage: 20,
      });
      
      const result = await deploymentManager.setTrafficPercentage(
        'test-server',
        '2.0.0',
        50
      );
      
      expect(result).toBe(true);
      
      expect(mockRegistry.updateTrafficPercentage).toHaveBeenCalledWith(
        'test-server',
        '2.0.0',
        50
      );
    });
    
    it('should throw if version does not exist', async () => {
      mockRegistry.getServerVersion.mockReturnValue(undefined);
      
      await expect(
        deploymentManager.setTrafficPercentage('test-server', '2.0.0', 50)
      ).rejects.toThrow('not found');
    });
  });
  
  describe('getServerVersions', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should return formatted server versions', () => {
      const mockVersions = [
        {
          version: '1.0.0',
          status: 'blue',
          trafficPercentage: 70,
          deploymentTimestamp: Date.now() - 3600000, // 1 hour ago
          type: 'stdio',
          command: 'echo',
          args: ['blue'],
          scope: 'project',
        },
        {
          version: '2.0.0',
          status: 'green',
          trafficPercentage: 30,
          deploymentTimestamp: Date.now(),
          type: 'sse',
          url: 'https://example.com/events',
          scope: 'global',
        },
      ];
      
      mockRegistry.getServerVersions.mockReturnValue(mockVersions);
      mockRegistry.getHealthStatus.mockReturnValue({
        isHealthy: true,
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        consecutiveSuccesses: 3,
      });
      
      const result = deploymentManager.getServerVersions('test-server');
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'test-server',
        version: '1.0.0',
        status: 'blue',
        trafficPercentage: 70,
        type: 'stdio',
        details: expect.stringContaining('echo'),
        isHealthy: true,
      });
      
      expect(result[1]).toMatchObject({
        name: 'test-server',
        version: '2.0.0',
        status: 'green',
        trafficPercentage: 30,
        type: 'sse',
        details: expect.stringContaining('https://example.com/events'),
        isHealthy: true,
      });
    });
  });
  
  describe('getVersionHistory', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should return formatted version history', () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const twoHoursAgo = now - 7200000;
      
      mockRegistry.getVersionHistory.mockReturnValue({
        statusHistory: [
          { status: 'green', timestamp: twoHoursAgo },
          { status: 'blue', timestamp: oneHourAgo },
        ],
        trafficHistory: [
          { percentage: 0, timestamp: twoHoursAgo },
          { percentage: 50, timestamp: twoHoursAgo + 1000 },
          { percentage: 100, timestamp: oneHourAgo },
        ],
      });
      
      mockRegistry.getRollbackHistory.mockReturnValue({
        fromVersion: '2.0.0',
        toVersion: '1.0.0',
        timestamp: now,
        reason: 'Test failure',
      });
      
      const result = deploymentManager.getVersionHistory('test-server', '1.0.0');
      
      expect(result).toHaveLength(6); // 2 status + 3 traffic + 1 rollback
      
      // Check that entries are sorted by timestamp (newest first)
      expect(result[0].timestamp).toBeGreaterThan(result[1].timestamp);
      
      // Check different types of entries
      expect(result.find(e => e.type === 'status' && e.details.includes('blue'))).toBeDefined();
      expect(result.find(e => e.type === 'traffic' && e.details.includes('100%'))).toBeDefined();
      expect(result.find(e => e.type === 'rollback')).toBeDefined();
    });
    
    it('should return empty array if no history', () => {
      mockRegistry.getVersionHistory.mockReturnValue(undefined);
      mockRegistry.getRollbackHistory.mockReturnValue(undefined);
      
      const result = deploymentManager.getVersionHistory('test-server', '1.0.0');
      
      expect(result).toEqual([]);
    });
  });
  
  describe('migrateExistingServers', () => {
    beforeEach(async () => {
      await deploymentManager.initialize();
    });
    
    it('should migrate servers without version history', async () => {
      // Mock configs with servers
      getCurrentProjectConfig.mockReturnValue({
        mcpServers: {
          'project-server': {
            type: 'stdio',
            command: 'echo',
            args: ['project'],
          },
        },
      });
      
      getGlobalConfig.mockReturnValue({
        mcpServers: {
          'global-server': {
            type: 'stdio',
            command: 'echo',
            args: ['global'],
          },
        },
      });
      
      getMcprcConfig.mockReturnValue({
        'mcprc-server': {
          type: 'sse',
          url: 'https://example.com/events',
        },
      });
      
      const count = await deploymentManager.migrateExistingServers();
      
      expect(count).toBe(3);      
      expect(mockRegistry.registerServer).toHaveBeenCalledTimes(3);
    });
  });
});
