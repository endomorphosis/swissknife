import { Command } from 'commander';
import { performance } from 'perf_hooks.js';
import { CLIUXEnhancer } from '../ux/cli-ux-enhancer';
import fs from 'fs/promises';
import path from 'path';

// Define the benchmark function type
type BenchmarkFunction = () => Promise<void>;

// Define benchmark result type
interface BenchmarkResult {
  name: string;
  executionTime: number;
  memoryUsage: {
    heapTotal: number;
    heapUsed: number;
    external: number;
    rss: number;
  };
}

class BenchmarkRunner {
  private benchmarks: Map<string, BenchmarkFunction> = new Map();
  
  constructor() {
    // Register standard benchmarks
    this.registerCoreBenchmarks();
  }
  
  /**
   * Register a benchmark function
   * @param name Benchmark name
   * @param fn Function to benchmark
   */
  register(name: string, fn: BenchmarkFunction): void {
    this.benchmarks.set(name, fn);
  }
  
  /**
   * Register core benchmarks
   */
  private registerCoreBenchmarks(): void {
    // Add storage benchmark
    this.register('storage-write', async () => {
      const testData = Buffer.from('x'.repeat(1024 * 1024)); // 1MB
      const tempPath = path.join('temp', 'benchmark-write-test.dat');
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, testData);
      await fs.unlink(tempPath);
    });
    
    // Add storage read benchmark
    this.register('storage-read', async () => {
      const testData = Buffer.from('x'.repeat(1024 * 1024)); // 1MB
      const tempPath = path.join('temp', 'benchmark-read-test.dat');
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, testData);
      await fs.readFile(tempPath);
      await fs.unlink(tempPath);
    });
    
    // Add memory allocation benchmark
    this.register('memory-allocation', async () => {
      const arrays: Buffer[] = [];
      for (let i = 0; i < 10; i++) {
        arrays.push(Buffer.alloc(1024 * 1024)); // Allocate 1MB
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  }
  
  /**
   * Run a specific benchmark
   * @param name Benchmark name
   * @returns Benchmark results
   */
  async runBenchmark(name: string): Promise<BenchmarkResult> {
    const fn = this.benchmarks.get(name);
    if (!fn) {
      throw new Error(`Benchmark '${name}' not found`);
    }
    
    // Collect garbage before running benchmark
    if (global.gc) {
      global.gc();
    }
    
    const beforeMemory = process.memoryUsage();
    const startTime = performance.now();
    
    await fn();
    
    const endTime = performance.now();
    const afterMemory = process.memoryUsage();
    
    return {
      name,
      executionTime: endTime - startTime,
      memoryUsage: {
        heapTotal: afterMemory.heapTotal - beforeMemory.heapTotal,
        heapUsed: afterMemory.heapUsed - beforeMemory.heapUsed,
        external: afterMemory.external - beforeMemory.external,
        rss: afterMemory.rss - beforeMemory.rss,
      }
    };
  }
  
  /**
   * Run all registered benchmarks
   * @returns Array of benchmark results
   */
  async runAll(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    for (const name of this.benchmarks.keys()) {
      const result = await this.runBenchmark(name);
      results.push(result);
    }
    return results;
  }
  
  /**
   * List available benchmarks
   * @returns Array of benchmark names
   */
  listBenchmarks(): string[] {
    return Array.from(this.benchmarks.keys());
  }
}

const benchmarkCommand = new Command('benchmark')
  .description('Run performance benchmarks')
  .option('--list', 'List available benchmarks')
  .option('--name <name>', 'Run a specific benchmark')
  .option('--output <file>', 'Save benchmark results to a JSON file')
  .action(async (options) => {
    const benchmarkRunner = new BenchmarkRunner();
    
    if (options.list) {
      CLIUXEnhancer.formatInfo('Available benchmarks:');
      benchmarkRunner.listBenchmarks().forEach(name => {
        console.log(`- ${name}`);
      });
      return;
    }
    
    const spinner = CLIUXEnhancer.showSpinner('Running benchmarks...');
    
    try {
      let results: BenchmarkResult[];
      
      if (options.name) {
        const result = await benchmarkRunner.runBenchmark(options.name);
        results = [result];
      } else {
        results = await benchmarkRunner.runAll();
      }
      
      CLIUXEnhancer.stopSpinner(spinner, true, 'Benchmarks completed');
      
      // Display results
      results.forEach(result => {
        CLIUXEnhancer.formatInfo(`Benchmark: ${result.name}`);
        console.log(`  Execution time: ${result.executionTime.toFixed(2)} ms`);
        console.log(`  Memory usage:`);
        console.log(`    Heap total: ${(result.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    Heap used: ${(result.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    External: ${(result.memoryUsage.external / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    RSS: ${(result.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
      });
      
      // Save results to file if requested
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(results, null, 2));
        CLIUXEnhancer.formatSuccess(`Benchmark results saved to ${options.output}`);
      }
    } catch (error) {
      CLIUXEnhancer.stopSpinner(spinner, false, 'Benchmark failed');
      CLIUXEnhancer.formatError(`Error running benchmark: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

export default benchmarkCommand;
