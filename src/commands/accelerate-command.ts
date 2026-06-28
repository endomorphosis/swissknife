// src/commands/accelerate-command.ts

import { Command } from '../cli/command.js';
import { logger } from '../utils/logger.js';
import { ConfigurationManager } from '../config/manager.js';
import chalk from 'chalk.js';
import ora from 'ora.js';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080';

/**
 * Command for interacting with IPFS Accelerate (ipfs_accelerate_py backend)
 * Routes through the handsfree /v1/ipfs/* unified API.
 */
export class AccelerateCommand implements Command {
  public readonly name = 'accelerate';
  public readonly description = 'Interact with IPFS Accelerate (hardware profiling, inference)';
  public readonly aliases = ['accel'];

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
      case 'profile':
      case 'hw':
        return this.hardwareProfile();
      case 'models':
        return this.listModels();
      case 'infer':
      case 'inference':
        return this.inference(args.slice(1));
      case 'embed':
        return this.embed(args.slice(1));
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

  private async hardwareProfile(): Promise<void> {
    const spinner = ora('Fetching hardware profile...').start();
    try {
      const resp = await this.request('GET', '/v1/ipfs/hardware_profile');
      spinner.succeed('Hardware profile retrieved');

      console.log(chalk.bold('\nHardware Profile'));
      console.log(`  ${chalk.cyan('GPU:')} ${resp.gpu || 'N/A'}`);
      console.log(`  ${chalk.cyan('VRAM:')} ${resp.vram || 'N/A'}`);
      console.log(`  ${chalk.cyan('Backends:')} ${(resp.backends || []).join(', ') || 'N/A'}`);
      console.log(`  ${chalk.cyan('Quantization:')} ${(resp.quantization_formats || []).join(', ') || 'N/A'}`);
      if (resp.compute_capability) {
        console.log(`  ${chalk.cyan('Compute:')} ${resp.compute_capability}`);
      }
      if (resp.cpu_count) {
        console.log(`  ${chalk.cyan('CPUs:')} ${resp.cpu_count}`);
      }
      console.log('');
    } catch (err) {
      spinner.fail(`Profile failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async listModels(): Promise<void> {
    const spinner = ora('Fetching available models...').start();
    try {
      const resp = await this.request('GET', '/v1/ipfs/list_models');
      spinner.succeed('Models retrieved');

      if (resp.models && resp.models.length > 0) {
        for (const model of resp.models) {
          const name = typeof model === 'string' ? model : model.name || model.id || JSON.stringify(model);
          console.log(chalk.cyan('  •') + ` ${name}`);
        }
      } else {
        console.log(chalk.yellow('  No models currently loaded'));
      }
    } catch (err) {
      spinner.fail(`List models failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async inference(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: accelerate infer <model_name> <input_text>'));
      return;
    }

    const modelName = args[0];
    const inputs = args.slice(1).join(' ');

    const spinner = ora(`Running inference on ${modelName}...`).start();
    try {
      const resp = await this.request('POST', '/v1/ipfs/inference', {
        model_name: modelName,
        inputs,
        parameters: {},
      });
      spinner.succeed('Inference complete');
      console.log(chalk.bold(`\nModel: ${resp.model}`));
      console.log(JSON.stringify(resp.result, null, 2));
    } catch (err) {
      spinner.fail(`Inference failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async embed(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: accelerate embed <text> [--model <name>]'));
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

    const spinner = ora('Generating embeddings via accelerate...').start();
    try {
      const resp = await this.request('POST', '/v1/ipfs/embed', {
        texts,
        model_name: modelName || null,
        provider: 'accelerate',
      });
      spinner.succeed('Embeddings generated');
      for (let i = 0; i < resp.embeddings.length; i++) {
        const emb = resp.embeddings[i];
        const preview = emb.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ');
        console.log(chalk.cyan(`[${i}]`) + ` dim=${emb.length} [${preview}, ...]`);
      }
      console.log(chalk.gray(`Provider: ${resp.provider_used}`));
    } catch (err) {
      spinner.fail(`Embed failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async generate(args: string[]): Promise<void> {
    const prompt = args.join(' ');
    if (!prompt) {
      console.log(chalk.red('Usage: accelerate generate <prompt>'));
      return;
    }

    const spinner = ora('Generating text via accelerate...').start();
    try {
      const resp = await this.request('POST', '/v1/ipfs/generate', {
        prompt,
        provider: 'accelerate',
      });
      spinner.succeed('Text generated');
      console.log(resp.text || JSON.stringify(resp));
      console.log(chalk.gray(`Provider: ${resp.provider_used}`));
    } catch (err) {
      spinner.fail(`Generate failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async status(): Promise<void> {
    const spinner = ora('Checking IPFS Accelerate status...').start();
    try {
      const resp = await this.request('GET', '/v1/ipfs/status');
      const accel = resp.ipfs_accelerate || {};
      spinner.succeed(accel.available ? 'IPFS Accelerate: Available' : 'IPFS Accelerate: Unavailable');
      if (accel.error) {
        console.log(chalk.red(`  Error: ${accel.error}`));
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
    console.log(chalk.bold('\nIPFS Accelerate Commands\n'));
    console.log('  ' + chalk.cyan('accelerate profile') + '                      Show hardware profile (GPU/VRAM/backends)');
    console.log('  ' + chalk.cyan('accelerate models') + '                       List loaded/available models');
    console.log('  ' + chalk.cyan('accelerate infer <model> <input>') + '        Run model inference');
    console.log('  ' + chalk.cyan('accelerate embed <text> [--model <n>]') + '   Generate embeddings');
    console.log('  ' + chalk.cyan('accelerate generate <prompt>') + '            Generate text via LLM');
    console.log('  ' + chalk.cyan('accelerate status') + '                       Check backend status');
    console.log('  ' + chalk.cyan('accelerate help') + '                         Show this help');
    console.log('');
  }
}
