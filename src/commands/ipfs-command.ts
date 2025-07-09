// src/commands/ipfs-command.ts

import { Command } from '../../cli/command';
import { IPFSKitClient } from '../../ipfs/client';
import { StorageService } from '../../storage/service';
import { logger } from '../../utils/logger';
import { ConfigurationManager } from '../../config/manager';
import chalk from 'chalk';
import Table from 'cli-table3';
import prettyBytes from 'pretty-bytes';
import ora from 'ora';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

/**
 * Command for interacting with IPFS
 */
export class IPFSCommand implements Command {
  public readonly name = 'ipfs';
  public readonly description = 'Interact with IPFS';
  public readonly aliases = ['i'];

  private client: IPFSKitClient | null = null;
  private storageService: StorageService;
  private config: ConfigurationManager;

  constructor() {
    this.storageService = StorageService.getInstance();
    this.config = ConfigurationManager.getInstance();
  }

  /**
   * Execute the IPFS command
   */
  public async execute(args: string[]): Promise<void> {
    // Initialize the IPFS client if needed
    if (!this.client) {
      await this.initClient();
    }

    if (args.length === 0) {
      return this.showHelp();
    }

    const subcommand = args[0];

    switch (subcommand) {
      case 'status':
        return this.status();
      case 'add':
        return this.add(args.slice(1));
      case 'get':
        return this.get(args.slice(1));
      case 'cat':
        return this.cat(args.slice(1));
      case 'pin':
        return this.pin(args.slice(1));
      case 'unpin':
        return this.unpin(args.slice(1));
      case 'pins':
        return this.listPins(args.slice(1));
      case 'help':
        return this.showHelp();
      default:
        console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
        return this.showHelp();
    }
  }

  /**
   * Initialize the IPFS client
   * @private
   */
  private async initClient(): Promise<void> {
    try {
      const apiUrl = this.config.get<string>('ipfs.apiUrl');
      const apiKey = this.config.get<string>('ipfs.apiKey');

      if (!apiUrl) {
        throw new Error('IPFS API URL not configured. Please set it in your config file.');
      }

      this.client = new IPFSKitClient({
        apiUrl,
        apiKey
      });

      // Test the connection
      const reachable = await this.client.isNodeReachable();
      if (!reachable) {
        throw new Error(`Could not connect to IPFS node at ${apiUrl}. Please check your configuration.`);
      }
    } catch (error) {
      console.log(chalk.red(`Error initializing IPFS client: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  }

  /**
   * Show the status of the IPFS node
   * @private
   */
  private async status(): Promise<void> {
    const spinner = ora('Fetching IPFS node status...').start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      const [nodeInfo, version] = await Promise.all([
        this.client.getNodeInfo(),
        this.client.getVersion()
      ]);

      spinner.succeed('IPFS node status retrieved');

      console.log(chalk.bold('\nIPFS Node Information'));
      console.log(`${chalk.cyan('ID:')} ${nodeInfo.ID}`);
      console.log(`${chalk.cyan('Agent Version:')} ${nodeInfo.AgentVersion}`);
      console.log(`${chalk.cyan('Protocol Version:')} ${nodeInfo.ProtocolVersion}`);
      
      console.log(chalk.bold('\nIPFS Version'));
      console.log(`${chalk.cyan('Version:')} ${version.Version}`);
      console.log(`${chalk.cyan('Commit:')} ${version.Commit}`);
      console.log(`${chalk.cyan('Repo:')} ${version.Repo}`);
      console.log(`${chalk.cyan('System:')} ${version.System}`);
      
      // Display addresses
      if (nodeInfo.Addresses && nodeInfo.Addresses.length > 0) {
        console.log(chalk.bold('\nNode Addresses'));
        for (const addr of nodeInfo.Addresses) {
          console.log(`- ${addr}`);
        }
      }
    } catch (error) {
      spinner.fail(`Failed to get IPFS status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add content to IPFS
   * @private
   */
  private async add(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log(chalk.red('Error: Missing file path'));
      console.log('Usage: ipfs add <file_path> [--pin] [--wrap-dir] [--cid=v0|v1]');
      return;
    }

    const filePath = args[0];
    const pin = args.includes('--pin');
    const wrapWithDirectory = args.includes('--wrap-dir');
    const cidVersionArg = args.find(arg => arg.startsWith('--cid='));
    const cidVersion = cidVersionArg ? 
      (cidVersionArg.endsWith('v1') ? 1 : 0) : 
      undefined;

    let spinner = ora(`Adding ${filePath} to IPFS...`).start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Check if file exists
      await fs.access(filePath);

      // Get file stats
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);

      if (stats.isDirectory()) {
        spinner.info(`${filePath} is a directory. Directory support is limited.`);
        // TODO: Add proper directory support
      }

      // Create a read stream for the file
      const stream = createReadStream(filePath);

      // Add the file to IPFS
      const result = await this.client.addContent(stream, {
        filename,
        pin,
        wrapWithDirectory,
        cidVersion
      });

      spinner.succeed(`Added ${filePath} to IPFS`);

      // Display result
      console.log(chalk.bold('\nIPFS Add Result'));
      console.log(`${chalk.cyan('CID:')} ${result.cid}`);
      console.log(`${chalk.cyan('Size:')} ${prettyBytes(result.size)}`);
      
      if (pin) {
        console.log(`${chalk.green('✓')} Content pinned`);
      }
      
      // Add to storage system if VFS is initialized
      if (this.storageService.isInitialized()) {
        spinner = ora('Adding to virtual filesystem...').start();
        
        try {
          // Make sure /ipfs path exists
          const ops = this.storageService.getOperations();
          if (!await ops.exists('/ipfs')) {
            await ops.mkdir('/ipfs', { recursive: true });
          }
          
          // Store a reference in the VFS
          const vfsPath = `/ipfs/${result.cid}`;
          
          // Just write a small metadata file for now
          const metadata = {
            cid: result.cid,
            originalPath: filePath,
            filename,
            size: result.size,
            addedAt: new Date().toISOString()
          };
          
          await ops.writeFile(`${vfsPath}.json`, JSON.stringify(metadata, null, 2));
          
          spinner.succeed(`Added reference to virtual filesystem at ${vfsPath}.json`);
        } catch (error) {
          spinner.fail(`Failed to add to virtual filesystem: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      spinner.fail(`Failed to add content to IPFS: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get content from IPFS and save it to a file
   * @private
   */
  private async get(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log(chalk.red('Error: Missing CID'));
      console.log('Usage: ipfs get <cid> [output_path]');
      return;
    }

    const cid = args[0];
    const outputPath = args[1] || `./${cid}`;

    const spinner = ora(`Getting ${cid} from IPFS...`).start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Get content from IPFS
      const content = await this.client.getContent(cid);

      // Write to file
      await fs.writeFile(outputPath, content);

      spinner.succeed(`Downloaded ${cid} to ${outputPath}`);
      console.log(`${chalk.cyan('Size:')} ${prettyBytes(content.length)}`);
    } catch (error) {
      spinner.fail(`Failed to get content from IPFS: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Display content from IPFS
   * @private
   */
  private async cat(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log(chalk.red('Error: Missing CID'));
      console.log('Usage: ipfs cat <cid>');
      return;
    }

    const cid = args[0];
    const spinner = ora(`Fetching ${cid} from IPFS...`).start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Get content from IPFS
      const content = await this.client.getContent(cid);
      
      spinner.succeed(`Retrieved ${cid} (${prettyBytes(content.length)})`);
      
      // Try to print as text, but handle binary data
      try {
        console.log(content.toString('utf-8'));
      } catch {
        console.log(chalk.yellow('Content appears to be binary and cannot be displayed as text'));
        console.log(`Use 'ipfs get ${cid} <output_path>' to save to a file`);
      }
    } catch (error) {
      spinner.fail(`Failed to get content from IPFS: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Pin content in IPFS
   * @private
   */
  private async pin(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log(chalk.red('Error: Missing CID'));
      console.log('Usage: ipfs pin <cid> [--recursive=false]');
      return;
    }

    const cid = args[0];
    const recursive = !args.includes('--recursive=false');
    const spinner = ora(`Pinning ${cid}...`).start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Pin the content
      const pinned = await this.client.pinContent(cid, recursive);
      
      if (pinned) {
        spinner.succeed(`Pinned ${cid} successfully`);
      } else {
        spinner.fail(`Failed to pin ${cid}`);
      }
    } catch (error) {
      spinner.fail(`Failed to pin content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Unpin content from IPFS
   * @private
   */
  private async unpin(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log(chalk.red('Error: Missing CID'));
      console.log('Usage: ipfs unpin <cid> [--recursive=false]');
      return;
    }

    const cid = args[0];
    const recursive = !args.includes('--recursive=false');
    const spinner = ora(`Unpinning ${cid}...`).start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Unpin the content
      const unpinned = await this.client.unpinContent(cid, recursive);
      
      if (unpinned) {
        spinner.succeed(`Unpinned ${cid} successfully`);
      } else {
        spinner.fail(`Failed to unpin ${cid}`);
      }
    } catch (error) {
      spinner.fail(`Failed to unpin content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List pinned content in IPFS
   * @private
   */
  private async listPins(args: string[]): Promise<void> {
    const type = args[0] || 'all';
    const spinner = ora('Listing pinned content...').start();

    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Get pins
      const pins = await this.client.listPins(type as any);
      
      spinner.succeed(`Found ${pins.length} pinned item(s)`);
      
      if (pins.length === 0) {
        return;
      }
      
      // Create a table to display the pins
      const table = new Table({
        head: [chalk.cyan('CID'), chalk.cyan('Type')],
        colWidths: [60, 15]
      });
      
      for (const pin of pins) {
        table.push([
          pin.cid,
          pin.type
        ]);
      }
      
      console.log(table.toString());
    } catch (error) {
      spinner.fail(`Failed to list pins: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Show help for the IPFS command
   * @private
   */
  private showHelp(): void {
    console.log(chalk.bold('\nIPFS Command Help'));
    console.log(`
${chalk.cyan('Usage:')} swissknife ipfs <subcommand> [options]

${chalk.cyan('Subcommands:')}
  ${chalk.green('status')}                    Show the status of the IPFS node
  ${chalk.green('add')} <file_path>           Add content to IPFS
    Options:
      --pin                Pin the content
      --wrap-dir           Wrap with directory
      --cid=v0|v1          CID version to use
  ${chalk.green('get')} <cid> [output_path]   Get content from IPFS
  ${chalk.green('cat')} <cid>                 Display content from IPFS
  ${chalk.green('pin')} <cid>                 Pin content in IPFS
  ${chalk.green('unpin')} <cid>               Unpin content from IPFS
  ${chalk.green('pins')} [type]               List pinned content

${chalk.cyan('Examples:')}
  swissknife ipfs status
  swissknife ipfs add ./myfile.txt --pin
  swissknife ipfs get QmXYZ ./downloaded-file.txt
  swissknife ipfs cat QmXYZ
  swissknife ipfs pin QmXYZ
    `);
  }
}