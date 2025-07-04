/**
 * Unit tests for performance CLI command
 */


// Mock dependencies
import { PerformanceOptimizer } from '../../../src/performance/optimizer';
import { TaskManager } from '../../../src/tasks/manager';
import { IPFSKitClient } from '../../../src/ipfs/client';
import { Agent } from '../../../src/ai/agent/agent';
import { Model } from '../../../src/ai/models/model';
import { performanceCommand } from '../../../src/cli/commands/performance';

describe('Performance Command', () => {
  let mockOptimizer: jest.Mocked<PerformanceOptimizer>;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    (Model as jest.Mock).mockImplementation(() => ({}));
    (Agent as jest.Mock).mockImplementation(() => ({}));
    (TaskManager as jest.Mock).mockImplementation(() => ({}));
    (IPFSKitClient as jest.Mock).mockImplementation(() => ({}));
    
    // Setup mock PerformanceOptimizer
    mockOptimizer = {
      optimize: jest.fn().mockResolvedValue(undefined)
    };
    
    (PerformanceOptimizer as jest.Mock).mockImplementation(() => mockOptimizer);
  });
  
  it('should create dependencies and run optimize when executed', async () => {
    // Arrange
    const action = performanceCommand.action as (options: any) => Promise<void>;
    
    // Act
    await action({});
    
    // Assert
    expect(Model).toHaveBeenCalled();
    expect(Agent).toHaveBeenCalled();
    expect(TaskManager).toHaveBeenCalled();
    expect(IPFSKitClient).toHaveBeenCalled();
    expect(PerformanceOptimizer).toHaveBeenCalled();
    expect(mockOptimizer.optimize).toHaveBeenCalled();
  });
  
  it('should have the correct command name and description', () => {
    // Assert
    expect(performanceCommand.name()).toBe('performance');
    expect(performanceCommand.description()).toBe('Run performance optimization tasks');
  });
});
