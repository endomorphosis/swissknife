/**
 * Simple test for terminal utilities
 */

// Mock dependencies
jest.mock('../../../src/services/claude.js', () => ({
  queryHaiku: jest.fn(),
}));

jest.mock('../../../src/utils/json.js', () => ({
  safeParseJSON: jest.fn(),
}));

jest.mock('../../../src/utils/log.js', () => ({
  logError: jest.fn(),
}));

describe('Terminal Utilities', () => {
  let originalTitle: string;
  let originalWrite: any;

  beforeEach(() => {
    jest.clearAllMocks();
    originalTitle = process.title;
    originalWrite = process.stdout.write;
    process.stdout.write = jest.fn();
  });

  afterEach(() => {
    process.title = originalTitle;
    process.stdout.write = originalWrite;
  });

  test('should be importable', async () => {
    const terminalUtils = await import('../../../src/utils/terminal.js');
    expect(terminalUtils).toBeDefined();
    expect(typeof terminalUtils.setTerminalTitle).toBe('function');
  });

  test('setTerminalTitle should work on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { setTerminalTitle } = await import('../../../src/utils/terminal.js');
    setTerminalTitle('Test Title');

    expect(process.title).toBe('✳ Test Title');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('setTerminalTitle should work on Unix', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const { setTerminalTitle } = await import('../../../src/utils/terminal.js');
    setTerminalTitle('Test Title');

    expect(process.stdout.write).toHaveBeenCalledWith('\x1b]0;✳ Test Title\x07');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });
});
