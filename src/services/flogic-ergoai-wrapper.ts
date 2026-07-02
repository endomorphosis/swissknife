/**
 * FLogic ErgoAI Wrapper + FLogic ZKP Integration — T-290 + T-291 (Sprint 63)
 * Ports of flogic/ergoai_wrapper.py (381L) and flogic/flogic_zkp_integration.py (372L)
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
  success:  boolean;
  error?:   string;
  elapsedMs: number;
}

export interface ErgoAIStats { totalQueries: number; succeeded: number; failed: number; avgElapsedMs: number }

export class ErgoAIWrapper {
  private readonly stats: ErgoAIStats = { totalQueries: 0, succeeded: 0, failed: 0, avgElapsedMs: 0 };

  constructor(private readonly config: ErgoAIConfig = defaultErgoAIConfig()) {}

  isAvailable(): boolean {
    if (!this.config.binaryPath) return false;
    try {
      const { existsSync } = require('fs') as { existsSync(p: string): boolean };
      return existsSync(this.config.binaryPath);
    } catch { return false; }
  }

  async query(formula: string): Promise<ErgoAIQueryResult> {
    const t0 = performance.now();
    this.stats.totalQueries++;
    if (!this.isAvailable()) {
      this.stats.failed++;
      const elapsed = performance.now() - t0;
      this._updateAvg(elapsed);
      return { query: formula, result: null, success: false, error: 'ErgoAI binary not available', elapsedMs: elapsed };
    }
    // Real implementation: spawn(this.config.binaryPath, [formula])
    this.stats.failed++;
    const elapsed = performance.now() - t0;
    this._updateAvg(elapsed);
    return { query: formula, result: null, success: false, error: 'ErgoAI FFI not bound', elapsedMs: elapsed };
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
  const candidates = ['/usr/local/bin/ergo', '/opt/ergoai/bin/ergo', './ergoai/ergo'];
  try {
    const { existsSync } = require('fs') as { existsSync(p: string): boolean };
    for (const p of candidates) { if (existsSync(p)) return p; }
  } catch { /* ignore */ }
  return null;
}

export function lazyInstallErgo(_reason: string): string | null {
  // Returns null — actual install requires system commands
  return findErgoBinary();
}

// ---------------------------------------------------------------------------
// T-291 — FLogic ZKP Integration
// ---------------------------------------------------------------------------

import { Groth16BackendFallback } from './zkp-backends';

export enum FLogicProvingMethod { STANDARD='standard', ZKP='zkp', HYBRID='hybrid' }

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
  private readonly zkpBackend = new Groth16BackendFallback();
  private readonly cache = new Map<string, ZKPFLogicResult>();
  private readonly stats: ZKPFLogicStats = { standardProofs: 0, zkpProofs: 0, cacheHits: 0, failures: 0 };

  async prove(formula: string, axioms: string[] = [], method: FLogicProvingMethod = FLogicProvingMethod.STANDARD): Promise<ZKPFLogicResult> {
    const key = `${formula}|${axioms.join(',')}|${method}`;
    const cached = this.cache.get(key);
    if (cached) { this.stats.cacheHits++; return cached; }

    const t0 = performance.now();
    let result: ZKPFLogicResult;

    if (method === FLogicProvingMethod.ZKP || method === FLogicProvingMethod.HYBRID) {
      const witness = JSON.stringify({ formula, axioms });
      const proof = await this.zkpBackend.generateProof(witness);
      result = { isProved: true, method, proof: proof.toDict(), confidence: 0.85, formula, elapsedMs: performance.now() - t0 };
      this.stats.zkpProofs++;
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
