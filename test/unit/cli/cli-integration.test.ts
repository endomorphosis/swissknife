
import { RealCLIBridge } from '../../../web/src/adapters/cli-bridge';
import { SwissKnifeCLIAdapter } from '../../../web/js/adapters/cli-adapter';

describe('Phase 1: CLI Integration', () => {
  let cliBridge: RealCLIBridge;
  let cliAdapter: SwissKnifeCLIAdapter;

  beforeAll(async () => {
    cliBridge = new RealCLIBridge();
    await cliBridge.initialize();
    cliAdapter = new SwissKnifeCLIAdapter(null); // SwissKnife instance is not relevant for this test
  });

  it('should execute a simple command and return success', async () => {
    // This test assumes a 'help' command exists and returns a successful output.
    // Replace with a more specific command if available and appropriate for a unit test.
    const result = await cliAdapter.executeCommand('help');
    expect(result.success).toBe(true);
    expect(result.output).toContain('SwissKnife CLI'); // Adjust expected output based on actual 'help' command
    expect(result.error).toBe('');
  });

  it('should return an error for an unknown command', async () => {
    const result = await cliAdapter.executeCommand('unknown-command-123');
    expect(result.success).toBe(false);
    expect(result.output).toBe('');
    expect(result.error).toContain('Unknown command'); // Adjust expected error message
  });
});
