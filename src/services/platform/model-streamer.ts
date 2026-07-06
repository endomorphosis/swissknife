/**
 * Handles streaming model outputs, adapting concepts from ipfs_accelerate_js.
 * Supports adaptive batching, KV-cache optimization hints, and performance metrics.
 */

/** Contract that any execution engine must satisfy to work with ModelStreamer. */
export interface ExecutionEngine {
  /** Generate tokens from a prompt. Yields token strings until done. */
  generateStream(prompt: string, options?: Record<string, unknown>): AsyncGenerator<string>;
}

/**
 * Configuration options for model streaming.
 */
export interface StreamingConfig {
  maxTokensPerStep?: number; // Max tokens to process/yield in one go
  latencyOptimized?: boolean; // Hint to prioritize time-to-first-token
  adaptiveBatchSize?: boolean; // Allow dynamic adjustment of internal batch size
  optimizeKVCache?: boolean; // Hint to optimize KV cache usage for LLMs
  // Add other streaming-related options as needed
}

/**
 * Metrics collected during a streaming generation process.
 */
export interface StreamingMetrics {
  timeToFirstToken: number | null; // Milliseconds from start to first token yield
  tokensPerSecond: number; // Average tokens generated per second
  totalGenerationTime: number; // Total time in seconds for the entire generation
  // Add other relevant metrics (e.g., cache hit rate, backend used)
}

export class ModelStreamer {
  private executionEngine: ExecutionEngine;
  private config: StreamingConfig;
  private metrics: StreamingMetrics | null = null;

  constructor(executionEngine: ExecutionEngine, config: StreamingConfig = {}) {
    this.executionEngine = executionEngine;
    // Default configuration + user overrides
    this.config = {
      maxTokensPerStep: 4, // Default value
      latencyOptimized: true,
      adaptiveBatchSize: true,
      optimizeKVCache: true,
      ...config
    };
    console.log('ModelStreamer initialized with config:', this.config);
  }

  /**
   * Generates tokens asynchronously as a stream (async generator).
   * @param {string} prompt - The input prompt for the model.
   * @param {any} [options={}] - Additional options for the execution engine (e.g., sampling params).
   * @returns {AsyncGenerator<string>} An async generator yielding tokens as strings.
   */
  async *generateTokenStream(prompt: string, options: any = {}): AsyncGenerator<string> {
    console.log('Starting token stream generation...');
    // Reset metrics for this run
    this.metrics = null;
    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;

    try {
      // Dispatch to execution engine, honouring config hints
      let batchSize = this.config.maxTokensPerStep ?? 4;
      let pendingBatch: string[] = [];

      for await (const token of this.executionEngine.generateStream(prompt, { ...options })) {
        if (tokenCount === 0) firstTokenTime = Date.now() - startTime;
        pendingBatch.push(token);
        tokenCount++;

        // Adaptive batching: yield when batch is full or KV-cache hint says to flush
        if (pendingBatch.length >= batchSize || !this.config.adaptiveBatchSize) {
          for (const t of pendingBatch) yield t;
          pendingBatch = [];
          // Optionally adjust batch size based on latency target
          if (this.config.adaptiveBatchSize && this.config.latencyOptimized) {
            const elapsed = Date.now() - startTime;
            batchSize = elapsed > 200 ? Math.max(1, batchSize - 1) : Math.min(16, batchSize + 1);
          }
        }
      }
      // Flush remaining
      for (const t of pendingBatch) yield t;

    } catch (error) {
      console.error('Error during token stream generation:', error);
      throw error; // Re-throw the error
    } finally {
      // Calculate final metrics
      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000; // Total time in seconds
      const tokensPerSecond = totalTime > 0 ? tokenCount / totalTime : 0;

      this.metrics = {
        timeToFirstToken: firstTokenTime,
        tokensPerSecond: tokensPerSecond,
        totalGenerationTime: totalTime
      };
      console.log('Token stream generation finished. Metrics:', this.metrics);
    }
  }

  /**
   * Returns the metrics collected during the last stream generation.
   * @returns {StreamingMetrics | null} The metrics object or null if no stream has been generated yet.
   */
  getMetrics(): StreamingMetrics | null {
    return this.metrics;
  }
}
