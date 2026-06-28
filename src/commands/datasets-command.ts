// src/commands/datasets-command.ts

import { Command } from '../cli/command.js';
import { logger } from '../utils/logger.js';
import { ConfigurationManager } from '../config/manager.js';
import chalk from 'chalk.js';
import ora from 'ora.js';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080';

/**
 * Command for interacting with IPFS Datasets (ipfs_datasets_py backend)
 * Routes through the handsfree /v1/ipfs/* unified API.
 */
export class DatasetsCommand implements Command {
  public readonly name = 'datasets';
  public readonly description = 'Interact with IPFS Datasets (embeddings, dataset discovery)';
  public readonly aliases = ['ds'];

  private config: ConfigurationManager;
  private backendUrl: string;

  constructor() {
    this.config = ConfigurationManager.getInstance();
    this.backendUrl = this.config.get<string>('handsfree.backendUrl') || DEFAULT_BACKEND_URL;
  }

  public async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      return this.showHelp();
    }

    const subcommand = args[0];
    switch (subcommand) {
      case 'embed':
        return this.embed(args.slice(1));
      case 'list':
        return this.listDatasets(args.slice(1));
      case 'generate':
        return this.generate(args.slice(1));
      case 'status':
        return this.status();
      case 'help':
        return this.showHelp();
      default:
        console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
        return this.showHelp();
    }
  }

  private async embed(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: datasets embed <text> [--model <name>]'));
      return;
    }

    const modelIdx = args.indexOf('--model');
    let modelName: string | undefined;
    let texts: string[];

    if (modelIdx !== -1) {
      modelName = args[modelIdx + 1];
      texts = args.filter((_, i) => i !== modelIdx && i !== modelIdx + 1);
    } else {
      texts = args;
    }

    const spinner = ora('Generating embeddings...').start();
    try {
      const resp = await this.request('POST', '/v1/ipfs/embed', {
        texts,
        model_name: modelName || null,
        provider: 'datasets',
      });
      spinner.succeed('Embeddings generated');

      if (resp.embeddings) {
        for (let i = 0; i < resp.embeddings.length; i++) {
          const emb = resp.embeddings[i];
          const preview = emb.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ');
          console.log(chalk.cyan(`[${i}]`) + ` dim=${emb.length} [${preview}, ...]`);
        }
      }
      console.log(chalk.gray(`Provider: ${resp.provider_used}`));
    } catch (err) {
      spinner.fail(`Embed failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async listDatasets(args: string[]): Promise<void> {
    const query = args.join(' ') || null;
    const spinner = ora('Searching datasets...').start();

    try {
      const resp = await this.request('POST', '/v1/ipfs/list_datasets', {
        query,
        limit: 20,
      });
      spinner.succeed('Datasets retrieved');

      if (resp.datasets && resp.datasets.length > 0) {
        for (const ds of resp.datasets) {
          const name = typeof ds === 'string' ? ds : ds.name || ds.id || JSON.stringify(ds);
          console.log(chalk.cyan('  •') + ` ${name}`);
        }
      } else {
        console.log(chalk.yellow('  No datasets found'));
      }
    } catch (err) {
      spinner.fail(`List failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async generate(args: string[]): Promise<void> {
    const prompt = args.join(' ');
    if (!prompt) {
      console.log(chalk.red('Usage: datasets generate <prompt>'));
      return;
    }

    const spinner = ora('Generating text...').start();
    try {
      const resp = await this.request('POST', '/v1/ipfs/generate', {
        prompt,
        provider: 'datasets',
      });
      spinner.succeed('Text generated');
      console.log(resp.text || JSON.stringify(resp));
      console.log(chalk.gray(`Provider: ${resp.provider_used}`));
    } catch (err) {
      spinner.fail(`Generate failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async status(): Promise<void> {
    const spinner = ora('Checking IPFS Datasets status...').start();
    try {
      const resp = await this.request('GET', '/v1/ipfs/status');
      const ds = resp.ipfs_datasets || {};
      spinner.succeed(ds.available ? 'IPFS Datasets: Available' : 'IPFS Datasets: Unavailable');
      if (ds.routers) {
        console.log(chalk.gray(`  Routers: ${Object.keys(ds.routers).join(', ')}`));
      }
      if (ds.error) {
        console.log(chalk.red(`  Error: ${ds.error}`));
      }
    } catch (err) {
      spinner.fail(`Status check failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.backendUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    const resp = await fetch(url, options);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  private showHelp(): void {
    console.log(chalk.bold('\nIPFS Datasets Commands\n'));
    console.log('  ' + chalk.cyan('datasets embed <text> [--model <name>]') + '  Generate embeddings');
    console.log('  ' + chalk.cyan('datasets list [query]') + '                   Search available datasets');
    console.log('  ' + chalk.cyan('datasets generate <prompt>') + '              Generate text via LLM');
    console.log('  ' + chalk.cyan('datasets status') + '                         Check backend status');
    console.log('  ' + chalk.cyan('datasets help') + '                           Show this help');
    console.log('');
  }
}
