
import { expect } from 'chai';
import { exec } from 'child_process';
import { createClient } from '../../src/client/mcp-client.js';

describe('CLI and Client Integration', () => {
  it('should allow the CLI to send a message to the client', (done) => {
    const client = createClient('ws://localhost:8080');
    client.on('message', (message) => {
      expect(message).to.equal('Hello from the CLI');
      done();
    });

    exec('node dist/cli.js message "Hello from the CLI"', (error, stdout, stderr) => {
      if (error) {
        done(error);
      }
    });
  });
});
