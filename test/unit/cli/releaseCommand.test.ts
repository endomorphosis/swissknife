/**
 * Unit tests for release CLI command
 */

import { ReleasePackager } from '../../../src/release/packager';
import { releaseCommand } from '../../../src/cli/commands/release';

// Mock dependencies
jest.mock('../../../src/release/packager');

describe('Release Command', () => {
  let mockPackager: jest.Mocked<ReleasePackager>;
  let mockExit: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock process.exit
    mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      return undefined as never;
    });
    
    // Mock console.error
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    
    // Setup mock ReleasePackager
    mockPackager = {
      packageForLinux: jest.fn().mockResolvedValue(undefined),
      packageForMacOS: jest.fn().mockResolvedValue(undefined),
      packageForWindows: jest.fn().mockResolvedValue(undefined),
      createPackages: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<ReleasePackager>;
    
    (ReleasePackager as jest.Mock).mockImplementation(() => mockPackager);
  });
  
  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });
  
  it('should have correct command name and description', () => {
    // Assert
    expect(releaseCommand.name()).toBe('release');
    expect(releaseCommand.description()).toBe('Create distributable packages for release');
  });
  
  it('should create packages for all platforms when no platform option is provided', async () => {
    // Arrange
    const action = releaseCommand.action as (options: any) => Promise<void>;
    
    // Act
    await action({});
    
    // Assert
    expect(ReleasePackager).toHaveBeenCalled();
    expect(mockPackager.createPackages).toHaveBeenCalled();
    expect(mockPackager.packageForLinux).not.toHaveBeenCalled();
    expect(mockPackager.packageForMacOS).not.toHaveBeenCalled();
    expect(mockPackager.packageForWindows).not.toHaveBeenCalled();
  });
  
  it('should create package for Linux when platform=linux', async () => {
    // Arrange
    const action = releaseCommand.action as (options: any) => Promise<void>;
    
    // Act
    await action({ platform: 'linux' });
    
    // Assert
    expect(ReleasePackager).toHaveBeenCalled();
    expect(mockPackager.packageForLinux).toHaveBeenCalled();
    expect(mockPackager.createPackages).not.toHaveBeenCalled();
  });
  
  it('should create package for macOS when platform=macos', async () => {
    // Arrange
    const action = releaseCommand.action as (options: any) => Promise<void>;
    
    // Act
    await action({ platform: 'macos' });
    
    // Assert
    expect(ReleasePackager).toHaveBeenCalled();
    expect(mockPackager.packageForMacOS).toHaveBeenCalled();
    expect(mockPackager.createPackages).not.toHaveBeenCalled();
  });
  
  it('should create package for Windows when platform=windows', async () => {
    // Arrange
    const action = releaseCommand.action as (options: any) => Promise<void>;
    
    // Act
    await action({ platform: 'windows' });
    
    // Assert
    expect(ReleasePackager).toHaveBeenCalled();
    expect(mockPackager.packageForWindows).toHaveBeenCalled();
    expect(mockPackager.createPackages).not.toHaveBeenCalled();
  });
  
  it('should show error and exit for unknown platform', async () => {
    // Arrange
    const action = releaseCommand.action as (options: any) => Promise<void>;
    
    // Act
    await action({ platform: 'unknown' });
    
    // Assert
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown platform'));
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockPackager.createPackages).not.toHaveBeenCalled();
  });
  
  it('should handle errors and exit with code 1', async () => {
    // Arrange
    const action = releaseCommand.action as (options: any) => Promise<void>;
    const error = new Error('Packaging failed');
    mockPackager.createPackages.mockRejectedValue(error);
    
    // Act
    await action({});
    
    // Assert
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error packaging release'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
