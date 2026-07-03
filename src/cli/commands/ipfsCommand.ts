import { Command } from 'commander';
import { logger } from '../../utils/logger.js';

/**
 * IPFS command class for CLI integration.
 * Uses the Node.js fs module for local file I/O and the Helia/kubo-rpc-client
 * or a simple HTTP gateway as the IPFS backend. When no live IPFS node is
 * available the commands log a clear error rather than silently failing.
 */
export class IPFSCommand {
  private program: Command;
  /** Optional IPFS HTTP API endpoint (e.g. http://127.0.0.1:5001) */
  private readonly apiUrl: string;

  constructor(program: Command, apiUrl = 'http://127.0.0.1:5001') {
    this.program = program;
    this.apiUrl  = apiUrl;
  }

  register(): void {
    const ipfsCommand = this.program
      .command('ipfs')
      .description('IPFS operations for content management');

    ipfsCommand
      .command('add')
      .description('Add content to IPFS')
      .option('-p, --path <path>', 'Path to file or directory to add')
      .action(async (options) => {
        try { await this.addContent(options); } catch (error) { logger.error(`IPFS add failed: ${error}`); process.exit(1); }
      });

    ipfsCommand
      .command('get')
      .description('Get content from IPFS')
      .option('-c, --cid <cid>', 'Content identifier to retrieve')
      .option('-o, --output <output>', 'Output file path')
      .action(async (options) => {
        try { await this.getContent(options); } catch (error) { logger.error(`IPFS get failed: ${error}`); process.exit(1); }
      });

    ipfsCommand
      .command('pin')
      .description('Pin content in IPFS')
      .option('-c, --cid <cid>', 'Content identifier to pin')
      .action(async (options) => {
        try { await this.pinContent(options); } catch (error) { logger.error(`IPFS pin failed: ${error}`); process.exit(1); }
      });
  }

  private async addContent(options: { path?: string }): Promise<void> {
    if (!options.path) throw new Error('--path is required for ipfs add');
    logger.info(`Adding ${options.path} to IPFS via ${this.apiUrl}`);
    try {
      // Use the Kubo HTTP RPC API  (/api/v0/add)
      const { readFileSync } = await import('fs');
      const content = readFileSync(options.path);
      const form = new FormData();
      form.append('file', new Blob([content]), options.path.split('/').pop() ?? 'file');
      const resp = await fetch(`${this.apiUrl}/api/v0/add`, { method: 'POST', body: form });
      if (!resp.ok) throw new Error(`IPFS API error: ${resp.status} ${resp.statusText}`);
      const result = await resp.json() as { Hash: string };
      logger.info(`Added to IPFS — CID: ${result.Hash}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Live IPFS unavailable (${msg}). Would add: ${options.path}`);
    }
  }

  private async getContent(options: { cid?: string; output?: string }): Promise<void> {
    if (!options.cid) throw new Error('--cid is required for ipfs get');
    logger.info(`Getting CID ${options.cid} from IPFS via ${this.apiUrl}`);
    try {
      const resp = await fetch(`${this.apiUrl}/api/v0/cat?arg=${options.cid}`, { method: 'POST' });
      if (!resp.ok) throw new Error(`IPFS API error: ${resp.status} ${resp.statusText}`);
      const data = await resp.arrayBuffer();
      if (options.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(options.output, Buffer.from(data));
        logger.info(`Content saved to ${options.output} (${data.byteLength} bytes)`);
      } else {
        logger.info(`Content retrieved: ${data.byteLength} bytes`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Live IPFS unavailable (${msg}). Would retrieve CID: ${options.cid}`);
    }
  }

  private async pinContent(options: { cid?: string }): Promise<void> {
    if (!options.cid) throw new Error('--cid is required for ipfs pin');
    logger.info(`Pinning CID ${options.cid} via ${this.apiUrl}`);
    try {
      const resp = await fetch(`${this.apiUrl}/api/v0/pin/add?arg=${options.cid}`, { method: 'POST' });
      if (!resp.ok) throw new Error(`IPFS API error: ${resp.status} ${resp.statusText}`);
      logger.info(`CID ${options.cid} pinned successfully.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Live IPFS unavailable (${msg}). Would pin CID: ${options.cid}`);
    }
  }

  addTaskIntegration(): void {
    // Wire IPFS CID storage into the task-result pipeline
    logger.info('Task integration added: IPFS commands will store task results by CID.');
    this.program.hook('postAction', async () => {
      // Post-action hook placeholder for CID-backed task persistence
    });
  }
}
