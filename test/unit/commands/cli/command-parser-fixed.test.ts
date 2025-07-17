/**
 * Fixed Test for CommandParser
 * Using comprehensive mocking strategy to avoid import path issues
 */

import { CommandRegistry } from '../../../../src/commands/registry';
import { Command, CommandOption } from '../../../../src/types/command';
import { CommandParser } from '../../../../src/cli/command-parser';

// Mock the CommandRegistry module directly
jest.mock('../../../../src/commands/registry', () => ({
  CommandRegistry: {
    getInstance: jest.fn(() => ({
      getCommand: jest.fn(),
      getAllCommands: jest.fn(),
      hasCommand: jest.fn(),
      registerCommand: jest.fn(),
      // Add other methods if they are called by CommandParser and need mocking
      // For example, if CommandParser calls registry.listCommandNames()
      listCommandNames: jest.fn(),
      listCommands: jest.fn(),
    })),
  },
}));

// Define mock command interface and types
interface MockCommandOption extends CommandOption {}

interface MockCommand extends Command {
  id: string;
  name: string;
  description: string;
  options?: MockCommandOption[];
  subcommands?: MockCommand[];
  aliases?: string[];
  parseArguments?: (args: string[]) => Record<string, any>;
  handler: (args: any, context: any) => Promise<number>;
}

const mockCommands: MockCommand[] = [
  {
    id: 'test',
    name: 'test',
    description: 'Test command',
    options: [
      { name: 'flag', alias: 'f', type: 'boolean', description: 'Test flag', default: false },
      { name: 'input', alias: 'i', type: 'string', description: 'Input value', required: false },
      { name: 'count', alias: 'c', type: 'number', description: 'Count value', default: 1 },
      { name: 'tags', alias: 't', type: 'array', description: 'Tag list' }
    ],
    aliases: ['t'],
    handler: async () => 0
  },
  {
    id: 'config',
    name: 'config',
    description: 'Configuration management',
    subcommands: [
      {
        id: 'config:set',
        name: 'set',
        description: 'Set configuration value',
        options: [
          { name: 'key', type: 'string', description: 'Config key', required: true },
          { name: 'value', type: 'string', description: 'Config value', required: true }
        ],
        handler: async () => 0
      },
      {
        id: 'config:get',
        name: 'get',
        description: 'Get configuration value',
        options: [
          { name: 'key', type: 'string', description: 'Config key', required: true }
        ],
        handler: async () => 0
      }
    ],
    handler: async () => 0
  }
];

describe('CommandParser', () => {
  let parser: CommandParser;
  let mockCommandRegistryInstance: any; // To hold the mocked instance

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked instance of CommandRegistry
    mockCommandRegistryInstance = CommandRegistry.getInstance();

    // Setup mock registry methods
    mockCommandRegistryInstance.getCommand.mockImplementation((name: string) => {
      if (name === 'test') return mockCommands[0];
      if (name === 'config') return mockCommands[1];
      if (name === 'config:set') return mockCommands[1].subcommands![0];
      if (name === 'config:get') return mockCommands[1].subcommands![1];
      return undefined;
    });
    
    mockCommandRegistryInstance.getAllCommands.mockReturnValue(mockCommands);
    mockCommandRegistryInstance.hasCommand.mockImplementation((name: string) => 
      ['test', 'config', 'config:set', 'config:get'].includes(name)
    );
    
    // Create parser instance with mocked registry
    parser = new CommandParser(mockCommandRegistryInstance);
  });

  describe('parseCommandLine', () => {
    it('should parse simple command', async () => {
      const result = await parser.parseCommandLine(['node', 'script.js', 'test']);
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe(mockCommands[0]);
      expect(result!.subcommands).toEqual([]);
    });

    it('should return null for empty arguments', async () => {
      const result = await parser.parseCommandLine(['node', 'script.js']);
      expect(result).toBeNull();
    });

    it('should parse command with subcommand', async () => {
      const result = await parser.parseCommandLine(['node', 'script.js', 'config', 'set']);
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe(mockCommands[1].subcommands![0]);
      expect(result!.subcommands).toEqual(['config']);
    });

    it('should handle unknown command', async () => {
      const result = await parser.parseCommandLine(['node', 'script.js', 'unknown']);
      expect(result).toBeNull();
    });

    it('should parse command with options', async () => {
      const result = await parser.parseCommandLine(['node', 'script.js', 'test', '--flag', '--input', 'value']);
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe(mockCommands[0]);
    });

    it('should handle command with mixed arguments', async () => {
      const result = await parser.parseCommandLine(['node', 'script.js', 'test', '--flag', '-i', 'input_value', '--count', '5']);
      
      expect(result).not.toBeNull();
      expect(result!.command).toBe(mockCommands[0]);
    });
  });
});