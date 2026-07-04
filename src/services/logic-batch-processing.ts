/**
 * Batch processing compatibility helpers for logic modules.
 *
 * TypeScript port of ipfs_datasets_py/logic/batch_processing.py remainders.
 */

import { parseFol } from './fol-utils/fol-parser.js';

export class LogicBatchResult<T = unknown> {
  readonly totalItems: number;
  readonly successful: number;
  readonly failed: number;
  readonly totalTime: number;
  readonly itemsPerSecond: number;
  readonly results: T[];
  readonly errors: Array<Record<string, unknown>>;

  constructor(input: {
    totalItems: number;
    successful: number;
    failed: number;
    totalTime: number;
    itemsPerSecond: number;
    results?: T[];
    errors?: Array<Record<string, unknown>>;
  }) {
    this.totalItems = input.totalItems;
    this.successful = input.successful;
    this.failed = input.failed;
    this.totalTime = input.totalTime;
    this.itemsPerSecond = input.itemsPerSecond;
    this.results = [...(input.results ?? [])];
    this.errors = [...(input.errors ?? [])];
  }

  successRate(): number {
    return this.totalItems === 0 ? 0 : (this.successful / this.totalItems) * 100;
  }

  toDict(): Record<string, unknown> {
    return {
      total_items: this.totalItems,
      successful: this.successful,
      failed: this.failed,
      total_time: this.totalTime,
      items_per_second: this.itemsPerSecond,
      success_rate: this.successRate(),
      results_count: this.results.length,
      errors_count: this.errors.length,
    };
  }

  success_rate = this.successRate.bind(this);
  to_dict = this.toDict.bind(this);
}

export class LogicBatchProcessor {
  readonly maxConcurrency: number;
  readonly showProgress: boolean;

  constructor(options: { maxConcurrency?: number; showProgress?: boolean } = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 10;
    this.showProgress = options.showProgress ?? true;
  }

  async processBatchAsync<TItem, TResult>(
    items: TItem[],
    processFunc: (item: TItem, index: number) => Promise<TResult> | TResult,
  ): Promise<LogicBatchResult<TResult>> {
    const started = Date.now();
    const results: TResult[] = [];
    const errors: Array<Record<string, unknown>> = [];
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < items.length) {
        const index = next;
        next += 1;
        try {
          results.push(await processFunc(items[index], index));
        } catch (error) {
          errors.push({ index, error: error instanceof Error ? error.message : String(error) });
        }
      }
    };

    const workerCount = Math.min(this.maxConcurrency, Math.max(items.length, 1));
    await Promise.all(Array.from({ length: workerCount }, worker));
    return makeResult(items.length, results, errors, started);
  }

  process_batch_async = this.processBatchAsync.bind(this);
}

export class FOLBatchProcessor {
  readonly processor: LogicBatchProcessor;

  constructor(maxConcurrency = 10) {
    this.processor = new LogicBatchProcessor({ maxConcurrency });
  }

  async convertBatch(
    texts: string[],
    options: {
      useNlp?: boolean;
      confidenceThreshold?: number;
      convertTextToFol?: (text: string, options: { useNlp: boolean; confidenceThreshold: number }) => Promise<unknown> | unknown;
    } = {},
  ): Promise<LogicBatchResult<unknown>> {
    const useNlp = options.useNlp ?? true;
    const confidenceThreshold = options.confidenceThreshold ?? 0.7;
    return this.processor.processBatchAsync(texts, text => {
      if (options.convertTextToFol) {
        return options.convertTextToFol(text, { useNlp, confidenceThreshold });
      }
      return parseFol(text);
    });
  }

  convert_batch = this.convertBatch.bind(this);
}

export class ProofBatchProcessor {
  readonly processor: LogicBatchProcessor;

  constructor(maxConcurrency = 5) {
    this.processor = new LogicBatchProcessor({ maxConcurrency });
  }

  async proveBatch(
    formulas: unknown[],
    options: {
      prover?: string;
      useCache?: boolean;
      proveFormula?: (formula: unknown, options: { prover: string; useCache: boolean }) => Promise<unknown> | unknown;
    } = {},
  ): Promise<LogicBatchResult<unknown>> {
    const prover = options.prover ?? 'z3';
    const useCache = options.useCache ?? true;
    return this.processor.processBatchAsync(formulas, formula => {
      if (options.proveFormula) return options.proveFormula(formula, { prover, useCache });
      return { formula, prover, use_cache: useCache, status: 'not_configured' };
    });
  }

  prove_batch = this.proveBatch.bind(this);
}

export class ChunkedBatchProcessor {
  readonly chunkSize: number;
  readonly processor: LogicBatchProcessor;

  constructor(options: { chunkSize?: number; maxConcurrency?: number } = {}) {
    this.chunkSize = options.chunkSize ?? 100;
    this.processor = new LogicBatchProcessor({ maxConcurrency: options.maxConcurrency ?? 10 });
  }

  async processLargeBatch<TItem, TResult>(
    items: TItem[],
    processFunc: (item: TItem, index: number) => Promise<TResult> | TResult,
  ): Promise<LogicBatchResult<TResult>> {
    const started = Date.now();
    const results: TResult[] = [];
    const errors: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < items.length; offset += this.chunkSize) {
      const chunk = items.slice(offset, offset + this.chunkSize);
      const chunkResult = await this.processor.processBatchAsync(chunk, (item, index) => processFunc(item, offset + index));
      results.push(...chunkResult.results);
      errors.push(...chunkResult.errors);
    }
    return makeResult(items.length, results, errors, started);
  }

  process_large_batch = this.processLargeBatch.bind(this);
}

export const BatchResult = LogicBatchResult;
export const BatchProcessor = LogicBatchProcessor;

function makeResult<T>(
  totalItems: number,
  results: T[],
  errors: Array<Record<string, unknown>>,
  started: number,
): LogicBatchResult<T> {
  const totalTime = (Date.now() - started) / 1000;
  return new LogicBatchResult({
    totalItems,
    successful: results.length,
    failed: errors.length,
    totalTime,
    itemsPerSecond: totalTime > 0 ? totalItems / totalTime : 0,
    results,
    errors,
  });
}
