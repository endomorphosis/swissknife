/**
 * FLogic ErgoAI Wrapper + FLogic ZKP Integration — T-290 + T-291 (Sprint 63)
 * Ports of flogic/ergoai_wrapper.py (381L) and flogic/flogic_zkp_integration.py (372L)
 *
 * Browser note: this module has no static Node.js imports. Host-native ErgoAI
 * execution is available only when callers inject an `ErgoAIProcessRunner`.
 */

// ---------------------------------------------------------------------------
// T-290 — ErgoAI Wrapper
// ---------------------------------------------------------------------------

export interface ErgoAIConfig {
  binaryPath: string | null;
  timeoutMs:  number;
  maxRetries: number;
}

export function defaultErgoAIConfig(): ErgoAIConfig {
  return { binaryPath: null, timeoutMs: 10_000, maxRetries: 1 };
}

export interface ErgoAIQueryResult {
  query:    string;
  result:   string | null;
  bindings: Array<Record<string, string>>;
  success:  boolean;
  error?:   string;
  elapsedMs: number;
}

export interface ErgoAIStats { totalQueries: number; succeeded: number; failed: number; avgElapsedMs: number }

export interface ErgoAIProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr?: string;
}

export type ErgoAIProcessRunner = (
  command: string,
  args: string[],
  input: string,
  timeoutMs: number,
) => ErgoAIProcessResult;

export function parseErgoOutputBindings(output: string): Array<Record<string, string>> {
  const bindings: Array<Record<string, string>> = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%')) continue;

    const binding: Record<string, string> = {};
    for (const rawPart of line.split(',')) {
      const part = rawPart.trim();
      const eqIdx = part.indexOf('=');
      if (eqIdx < 0) continue;
      const variable = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (variable.startsWith('?')) binding[variable] = value;
    }
    if (Object.keys(binding).length > 0) bindings.push(binding);
  }
  return bindings;
}

export class ErgoAIWrapper {
  private readonly stats: ErgoAIStats = { totalQueries: 0, succeeded: 0, failed: 0, avgElapsedMs: 0 };

  constructor(
    private readonly config: ErgoAIConfig = defaultErgoAIConfig(),
    private readonly runner?: ErgoAIProcessRunner,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.config.binaryPath && this.runner);
  }

  async query(formula: string): Promise<ErgoAIQueryResult> {
    const t0 = performance.now();
    this.stats.totalQueries++;
    if (!this.isAvailable()) {
      this.stats.failed++;
      const elapsed = performance.now() - t0;
      this._updateAvg(elapsed);
      return { query: formula, result: null, bindings: [], success: false, error: 'ErgoAI binary not available', elapsedMs: elapsed };
    }

    const binaryPath = this.config.binaryPath;
    if (!binaryPath) {
      this.stats.failed++;
      const elapsed = performance.now() - t0;
      this._updateAvg(elapsed);
      return { query: formula, result: null, bindings: [], success: false, error: 'ErgoAI binary path missing', elapsedMs: elapsed };
    }
    const runner = this.runner;
    if (!runner) {
      this.stats.failed++;
      const elapsed = performance.now() - t0;
      this._updateAvg(elapsed);
      return { query: formula, result: null, bindings: [], success: false, error: 'ErgoAI process runner not configured', elapsedMs: elapsed };
    }

    const attempts = Math.max(1, this.config.maxRetries);
    let lastError = 'ErgoAI process failed';
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        // The adapter sends the formula via stdin to keep transport stable across Ergo CLI layouts.
        const result = runner(binaryPath, ['--query', '-'], formula, this.config.timeoutMs);
        if (result.status === 0) {
          const stdoutTrimmed = result.stdout.trim();
          const stderrTrimmed = (result.stderr ?? '').trim();
          const combinedOutput = [stdoutTrimmed, stderrTrimmed].filter(Boolean).join('\n');

          if (combinedOutput.includes('++Error')) {
            this.stats.failed++;
            const elapsed = performance.now() - t0;
            this._updateAvg(elapsed);
            return {
              query: formula,
              result: null,
              bindings: [],
              success: false,
              error: `ErgoAI query failed: ${combinedOutput}`,
              elapsedMs: elapsed,
            };
          }

          if (stdoutTrimmed === 'No' || stdoutTrimmed.includes('\nNo\n')) {
            this.stats.failed++;
            const elapsed = performance.now() - t0;
            this._updateAvg(elapsed);
            return {
              query: formula,
              result: null,
              bindings: [],
              success: false,
              error: 'ErgoAI query returned no solution (No)',
              elapsedMs: elapsed,
            };
          }

          const bindings = parseErgoOutputBindings(stdoutTrimmed);
          this.stats.succeeded++;
          const elapsed = performance.now() - t0;
          this._updateAvg(elapsed);
          return {
            query: formula,
            result: stdoutTrimmed || null,
            bindings,
            success: true,
            elapsedMs: elapsed,
          };
        }
        lastError = (result.stderr ?? '').trim() || `ErgoAI exited with status ${String(result.status)}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    this.stats.failed++;
    const elapsed = performance.now() - t0;
    this._updateAvg(elapsed);
    return {
      query: formula,
      result: null,
      bindings: [],
      success: false,
      error: `ErgoAI process failed: ${lastError}`,
      elapsedMs: elapsed,
    };
  }

  async queryBatch(formulas: string[]): Promise<ErgoAIQueryResult[]> {
    return Promise.all(formulas.map(f => this.query(f)));
  }

  getStats(): Readonly<ErgoAIStats> { return { ...this.stats }; }

  private _updateAvg(ms: number): void {
    const n = this.stats.totalQueries;
    this.stats.avgElapsedMs = ((n - 1) * this.stats.avgElapsedMs + ms) / n;
  }
}

export function findErgoBinary(): string | null {
  return null;
}

export function lazyInstallErgo(_reason: string): string | null {
  // Returns null — actual install requires system commands
  return findErgoBinary();
}

// ---------------------------------------------------------------------------
// T-291 — FLogic ZKP Integration
// ---------------------------------------------------------------------------

export enum FLogicProvingMethod { STANDARD='standard', ZKP='zkp', HYBRID='hybrid' }

export interface FLogicZKPProofLike {
  toDict(): Record<string, unknown>;
}

export interface FLogicZKPBackendProtocol {
  generateProof(witnessJson: string, seed?: number): Promise<FLogicZKPProofLike>;
}

class BrowserStrictUnavailableZKPBackend implements FLogicZKPBackendProtocol {
  async generateProof(): Promise<FLogicZKPProofLike> {
    throw new Error('ZKP backend unavailable. Inject a WASM or explicit test backend for ZKP/HYBRID FLogic proofs.');
  }
}

export interface ZKPFLogicResult {
  isProved:  boolean;
  method:    FLogicProvingMethod;
  proof:     Record<string,unknown> | null;
  confidence: number;
  formula:   string;
  elapsedMs: number;
}

export interface ZKPFLogicStats { standardProofs: number; zkpProofs: number; cacheHits: number; failures: number }

export class ZKPFLogicProver {
  private readonly zkpBackend: FLogicZKPBackendProtocol;
  private readonly cache = new Map<string, ZKPFLogicResult>();
  private readonly stats: ZKPFLogicStats = { standardProofs: 0, zkpProofs: 0, cacheHits: 0, failures: 0 };

  constructor(zkpBackend: FLogicZKPBackendProtocol = new BrowserStrictUnavailableZKPBackend()) {
    this.zkpBackend = zkpBackend;
  }

  async prove(formula: string, axioms: string[] = [], method: FLogicProvingMethod = FLogicProvingMethod.STANDARD): Promise<ZKPFLogicResult> {
    const key = `${formula}|${axioms.join(',')}|${method}`;
    const cached = this.cache.get(key);
    if (cached) { this.stats.cacheHits++; return cached; }

    const t0 = performance.now();
    let result: ZKPFLogicResult;

    if (method === FLogicProvingMethod.ZKP || method === FLogicProvingMethod.HYBRID) {
      const witness = JSON.stringify({ formula, axioms });
      try {
        const proof = await this.zkpBackend.generateProof(witness);
        result = { isProved: true, method, proof: proof.toDict(), confidence: 0.85, formula, elapsedMs: performance.now() - t0 };
        this.stats.zkpProofs++;
      } catch {
        this.stats.failures++;
        result = { isProved: false, method, proof: null, confidence: 0, formula, elapsedMs: performance.now() - t0 };
      }
    } else {
      // Standard forward-chaining
      const known = new Set<string>(axioms);
      let proved = known.has(formula);
      if (!proved) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const a of [...known]) {
            const idx = a.indexOf('→');
            if (idx < 0) continue;
            const ant = a.slice(0, idx).trim(), cons = a.slice(idx+1).trim();
            if (known.has(ant) && !known.has(cons)) { known.add(cons); changed = true; if (cons === formula) { proved = true; break; } }
          }
          if (proved) break;
        }
      }
      result = { isProved: proved, method, proof: null, confidence: proved ? 0.9 : 0, formula, elapsedMs: performance.now() - t0 };
      proved ? this.stats.standardProofs++ : this.stats.failures++;
    }

    this.cache.set(key, result);
    return result;
  }

  getStats(): Readonly<ZKPFLogicStats> { return { ...this.stats }; }
}
