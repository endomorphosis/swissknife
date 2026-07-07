/**
 * BatchProcessor — async/parallel batch formula evaluation.
 *
 * Mirrors ipfs_datasets_py/logic/batch_processing.py (389 lines):
 *   class BatchResult
 *   BatchLogicProcessor (async batch conversion + parallel proof execution)
 *
 * Wraps the WasmProverHub for bulk policy consistency checking and provides
 * general-purpose batch processing with progress tracking.
 *
 * Sprint 19, T-102.
 * Reference: ipfs_datasets_py/logic/batch_processing.py
 */

// ---------------------------------------------------------------------------
// BatchResult
// ---------------------------------------------------------------------------

/** Result from a batch processing run. */
export interface BatchResult<T = unknown> {
  readonly total_items:       number;
  readonly successful:        number;
  readonly failed:            number;
  readonly total_time_ms:     number;
  readonly items_per_second:  number;
  readonly results:           Array<{ index: number; item: unknown; result: T }>;
  readonly errors:            Array<{ index: number; item: unknown; error: string }>;
}

export function successRate(r: BatchResult): number {
  return r.total_items > 0 ? r.successful / r.total_items : 0;
}

// ---------------------------------------------------------------------------
// BatchProcessorOptions
// ---------------------------------------------------------------------------

export interface BatchProcessorOptions {
  /** Maximum number of concurrent items. Default: 4. */
  concurrency?: number;
  /** Timeout per item in ms. Default: 5000. */
  timeoutMs?: number;
  /** Optional progress callback called after each item completes. */
  onProgress?: (completed: number, total: number) => void;
}

// ---------------------------------------------------------------------------
// BatchProcessor
// ---------------------------------------------------------------------------

/**
 * BatchProcessor — generic async batch item processor.
 *
 * Processes items concurrently with configurable concurrency and timeout.
 *
 * Usage:
 * ```ts
 * const result = await BatchProcessor.process(
 *   policies,
 *   policy => hub.checkPolicyConsistency(policy),
 *   { concurrency: 4 },
 * );
 * console.log(`Success rate: ${(successRate(result) * 100).toFixed(1)}%`);
 * ```
 */
export class BatchProcessor {
  /**
   * Process `items` in parallel with `fn`, up to `concurrency` at a time.
   *
   * Python ref: `BatchLogicProcessor` parallel batch evaluation.
   */
  static async process<TItem, TResult>(
    items: TItem[],
    fn: (item: TItem, index: number) => Promise<TResult>,
    opts: BatchProcessorOptions = {},
  ): Promise<BatchResult<TResult>> {
    const {
      concurrency = 4,
      timeoutMs   = 5_000,
      onProgress,
    } = opts;

    const start     = Date.now();
    const results:  Array<{ index: number; item: TItem; result: TResult }> = [];
    const errors:   Array<{ index: number; item: TItem; error: string }>   = [];
    let completed   = 0;

    // Process in concurrent batches
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const promises = chunk.map((item, ci) => {
        const idx = i + ci;
        const withTimeout = new Promise<TResult>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
            timer = null;
            reject(new Error(`timeout after ${timeoutMs}ms`));
          }, timeoutMs);
          fn(item, idx)
            .then(r => { if (timer) { clearTimeout(timer); timer = null; } resolve(r); })
            .catch(e => { if (timer) { clearTimeout(timer); timer = null; } reject(e); });
        });

        return withTimeout
          .then(result => {
            results.push({ index: idx, item, result });
          })
          .catch((err: unknown) => {
            errors.push({
              index: idx,
              item,
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            completed++;
            onProgress?.(completed, items.length);
          });
      });

      await Promise.all(promises);
    }

    const elapsed_ms = Date.now() - start;
    const ips = elapsed_ms > 0 ? (items.length / elapsed_ms) * 1000 : 0;

    return {
      total_items:       items.length,
      successful:        results.length,
      failed:            errors.length,
      total_time_ms:     elapsed_ms,
      items_per_second:  ips,
      results,
      errors,
    };
  }

  /**
   * Process items sequentially (no concurrency).
   * Useful when the processing function has side effects.
   */
  static async processSerial<TItem, TResult>(
    items: TItem[],
    fn: (item: TItem, index: number) => Promise<TResult>,
    opts: Omit<BatchProcessorOptions, 'concurrency'> = {},
  ): Promise<BatchResult<TResult>> {
    return BatchProcessor.process(items, fn, { ...opts, concurrency: 1 });
  }
}
