// Mock global config functions

/**
 * Unit tests for mcpClient service
 */
// Mock config modules
jest.mock('../../../../src/utils/config', () => {
    const originalModule = jest.requireActual('../../../../src/utils/config');
    return {
        __esModule: true,
        ...originalModule,
        getCurrentProjectConfig: jest.fn(),
        saveCurrentProjectConfig: jest.fn(),
        getGlobalConfig: jest.fn(),
        saveGlobalConfig: jest.fn(),
        getMcprcConfig: jest.fn(),
        addMcprcServerForTesting: jest.fn(),
        removeMcprcServerForTesting: jest.fn(),
    };
});
jest.mock('../../../../src/utils/state', () => ({
    __esModule: true,
    getCwd: jest.fn().mockReturnValue('/test/path'),
}));
jest.mock('fs', () => ({
    __esModule: true,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

import { MCPClient } from '../../../src/services/mcp/mcpClient.ts';
import { parseEnvVars, ensureConfigScope, getMcprcServerStatus, getMcpServer, listMCPServers } from '../../../src/services/mcp/mcpClient.ts';

// Mock config modules
jest.mock('../../../../src/utils/config', () => {
    const originalModule = jest.requireActual('../../../../src/utils/config');
    return {
        __esModule: true,
        ...originalModule,
        getCurrentProjectConfig: jest.fn(),
        saveCurrentProjectConfig: jest.fn(),
        getGlobalConfig: jest.fn(),
        saveGlobalConfig: jest.fn(),
        getMcprcConfig: jest.fn(),
        addMcprcServerForTesting: jest.fn(),
        removeMcprcServerForTesting: jest.fn(),
    };
});
jest.mock('../../../../src/utils/state', () => ({
    __esModule: true,
    getCwd: jest.fn().mockReturnValue('/test/path'),
}));
jest.mock('fs', () => ({
    __esModule: true,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

// Import the functions we need to mock
const { getCurrentProjectConfig, getGlobalConfig, getMcprcConfig } = require('@utils/config');

describe('MCP Client Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Set up default mock returns
        const getCurrentProjectConfigMock = getCurrentProjectConfig;
        getCurrentProjectConfigMock.mockReturnValue({
            mcpServers: {
                'local-server': {
                    type: 'stdio',
                    command: 'node',
                    args: ['server.js']
                }
            },
            approvedMcprcServers: ['approved-server'],
            rejectedMcprcServers: ['rejected-server'],
        });
        const getGlobalConfigMock = require('../../../../src/utils/config').getGlobalConfig;
        getGlobalConfigMock.mockReturnValue({
            mcpServers: {
                'global-server': {
                    type: 'stdio',
                    command: 'python',
                    args: ['server.py']
                }
            }
        });
        const getMcprcConfigMock = getMcprcConfig;
        getMcprcConfigMock.mockReturnValue({
            'mcprc-server': {
                type: 'stdio',
                command: 'ruby',
                args: ['server.rb']
            },
            'approved-server': {
                type: 'stdio',
                command: 'php',
                args: ['server.php']
            },
            'rejected-server': {
                type: 'stdio',
                command: 'perl',
                args: ['server.pl']
            }
        });
    });
    describe('parseEnvVars', () => {
        it('should parse environment variables correctly', () => {
            const result = parseEnvVars(['KEY1=value1', 'KEY2=value2', 'KEY3=value=with=equals']);
            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2',
                KEY3: 'value=with=equals'
            });
        });
        it('should return empty object for undefined input', () => {
            const result = parseEnvVars(undefined);
            expect(result).toEqual({});
        });
        it('should throw error for invalid format', () => {
            expect(() => parseEnvVars(['INVALID'])).toThrow(/Invalid environment variable format/);
        });
    });
    describe('ensureConfigScope', () => {
        it('should return "project" for undefined scope', () => {
            expect(ensureConfigScope()).toBe('project');
        });
        it('should return valid scope unchanged', () => {
            expect(ensureConfigScope('project')).toBe('project');
            expect(ensureConfigScope('global')).toBe('global');
        });
        it('should throw for invalid scope', () => {
            expect(() => ensureConfigScope('invalid')).toThrow(/Invalid scope/);
        });
        it('should restrict mcprc for external users', () => {
            const originalEnv = process.env.USER_TYPE;
            process.env.USER_TYPE = 'external';
            expect(() => ensureConfigScope('mcprc')).toThrow(/Invalid scope/);
            process.env.USER_TYPE = originalEnv;
        });
    });
    describe('getMcprcServerStatus', () => {
        it('should return approved status for approved server', () => {
            expect(getMcprcServerStatus('approved-server')).toBe('approved');
        });
        it('should return rejected status for rejected server', () => {
            expect(getMcprcServerStatus('rejected-server')).toBe('rejected');
        });
        it('should return pending status for unknown server', () => {
            expect(getMcprcServerStatus('unknown-server')).toBe('pending');
        });
    });
    describe('getMcpServer', () => {
        it('should get project-level server with highest precedence', () => {
            const result = getMcpServer('local-server');
            expect(result).toEqual({
                type: 'stdio',
                command: 'node',
                args: ['server.js'],
                scope: 'project'
            });
        });
        it('should get mcprc server if not in project config', () => {
            const result = getMcpServer('mcprc-server');
            expect(result).toEqual({
                type: 'stdio',
                command: 'ruby',
                args: ['server.rb'],
                scope: 'mcprc'
            });
        });
        it('should get global server with lowest precedence', () => {
            const result = getMcpServer('global-server');
            expect(result).toEqual({
                type: 'stdio',
                command: 'python',
                args: ['server.py'],
                scope: 'global'
            });
        });
        it('should return undefined for non-existent server', () => {
            const result = getMcpServer('non-existent');
            expect(result).toBeUndefined();
        });
    });
    describe('listMCPServers', () => {
        it('should merge all available servers with correct precedence', () => {
            const result = listMCPServers();
            expect(result).toEqual({
                'local-server': { type: 'stdio', command: 'node', args: ['server.js'] },
                'global-server': { type: 'stdio', command: 'python', args: ['server.py'] },
                'mcprc-server': { type: 'stdio', command: 'ruby', args: ['server.rb'] },
                'approved-server': { type: 'stdio', command: 'php', args: ['server.php'] },
                'rejected-server': { type: 'stdio', command: 'perl', args: ['server.pl'] },
            });
        });
    });
});
//# sourceMappingURL=mcpClient.test.js.map
