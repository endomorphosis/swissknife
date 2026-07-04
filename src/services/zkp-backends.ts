/**
 * ZKP Backends — T-250 (Sprint 55)
 *
 * Ports of:
 *   - ipfs_datasets_py/logic/zkp/backends/groth16_ffi.py  (613L)
 *   - ipfs_datasets_py/logic/zkp/backends/provekit_ffi.py (559L)
 *
 * Provides:
 *   - `ZKPBackendProtocol`   — interface for ZKP backends
 *   - `Groth16Proof`         — Groth16-specific proof data structure
 *   - `Groth16Backend`       — Rust FFI-backed backend (requires external binary)
 *   - `Groth16BackendFallback` — simulated backend for testing
 *   - `ProveKitFFI`          — ProveKit FFI stub (requires native library)
 */

import { createHash } from 'crypto';

export interface ZKPProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr?: string;
}

export type ZKPProcessRunner = (
  command: string,
  args: string[],
  input: string,
  timeoutMs: number,
) => ZKPProcessResult;

export interface Groth16BackendOptions {
  /** Explicit opt-in for deterministic non-cryptographic fallback proofs. */
  allowSimulatedFallback?: boolean;
  fallbackBackend?: ZKPBackendProtocol;
}

function defaultProcessRunner(command: string, args: string[], input: string, timeoutMs: number): ZKPProcessResult {
  const { spawnSync } = require('child_process') as typeof import('child_process');
  const result = spawnSync(command, args, { input, timeout: timeoutMs, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// ---------------------------------------------------------------------------
// ZKPBackendProtocol
// ---------------------------------------------------------------------------

export interface ZKPBackendProtocol {
  generateProof(witnessJson: string, seed?: number): Promise<Groth16Proof>;
  verifyProof(proofJson: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Groth16Proof
// ---------------------------------------------------------------------------

/** Groth16-specific proof structure. */
export class Groth16Proof {
  constructor(
    public readonly proofData: Uint8Array,
    public readonly publicInputs: Record<string, unknown>,
    public readonly metadata: Record<string, unknown>,
    public readonly timestamp: number,
    public readonly sizeBytes: number,
  ) {}

  toDict(): Record<string, unknown> {
    const proofHex = Buffer.from(this.proofData).toString('hex');
    const proofHash = createHash('sha256').update(this.proofData).digest('hex');
    return {
      proofData:    proofHex,
      proof_hash:   proofHash,
      is_proved:    this.proofData.length > 0,
      publicInputs: this.publicInputs,
      metadata:     this.metadata,
      timestamp:    this.timestamp,
      sizeBytes:    this.sizeBytes,
    };
  }

  static fromDict(data: Record<string, unknown>): Groth16Proof {
    const hex = (data['proofData'] as string) ?? '';
    const proofData = hex ? Uint8Array.from(Buffer.from(hex, 'hex')) : new Uint8Array(0);
    return new Groth16Proof(
      proofData,
      (data['publicInputs'] as Record<string, unknown>) ?? {},
      (data['metadata']     as Record<string, unknown>) ?? {},
      (data['timestamp']    as number) ?? 0,
      (data['sizeBytes']    as number) ?? proofData.length,
    );
  }
}

// ---------------------------------------------------------------------------
// Groth16BackendStats
// ---------------------------------------------------------------------------

export interface Groth16BackendStats {
  proofsGenerated: number;
  proofsVerified: number;
  failures: number;
  totalProofTimeMs: number;
}

// ---------------------------------------------------------------------------
// Groth16Backend (real FFI — requires Rust binary)
// ---------------------------------------------------------------------------

/**
 * Real Groth16 zkSNARK backend.
 *
 * TypeScript port of `Groth16Backend` from `groth16_ffi.py`.
 *
 * When the Rust binary is unavailable, proof generation and verification
 * return stub results rather than crashing (matching the Python fallback
 * pattern).
 */
export class Groth16Backend implements ZKPBackendProtocol {
  private readonly stats: Groth16BackendStats = {
    proofsGenerated: 0, proofsVerified: 0, failures: 0, totalProofTimeMs: 0,
  };

  constructor(
    private readonly binaryPath: string | null = null,
    private readonly timeoutMs = 30_000,
    private readonly runner: ZKPProcessRunner = defaultProcessRunner,
    private readonly options: Groth16BackendOptions = {},
  ) {}

  isAvailable(): boolean {
    // In pure-TS runtime, the native binary is not available
    if (!this.binaryPath) return false;
    try {
      const { existsSync } = require('node:fs') as { existsSync: (p: string) => boolean };
      return existsSync(this.binaryPath);
    } catch { return false; }
  }

  async generateProof(witnessJson: string, seed?: number): Promise<Groth16Proof> {
    const t0 = performance.now();
    this.stats.proofsGenerated++;

    if (!this.isAvailable()) {
      this.stats.failures++;
      this.stats.totalProofTimeMs += performance.now() - t0;
      return this.fallbackOrThrow(witnessJson, seed, 'Groth16 native binary not available');
    }

    // PORT-192: spawn the real Groth16 binary when available
    try {
      const result = this.runner(
        this.binaryPath!,
        ['prove', '--witness', '-'],
        witnessJson,
        this.timeoutMs,
      );
      if (result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        this.stats.totalProofTimeMs += performance.now() - t0;
        return new Groth16Proof(
          Buffer.from(String(parsed['pi_a'] ?? ''), 'hex'),
          parsed['public_inputs'] as Record<string, string>,
          { backend: 'groth16-native', binary: this.binaryPath },
          Date.now(),
          result.stdout.length,
        );
      }
    } catch { /* fall through */ }
    this.stats.failures++;
    this.stats.totalProofTimeMs += performance.now() - t0;
    return this.fallbackOrThrow(witnessJson, seed, 'Groth16 native prover invocation failed');
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    this.stats.proofsVerified++;
    if (!this.isAvailable()) {
      return this.options.allowSimulatedFallback === true
        ? (this.options.fallbackBackend ?? new Groth16BackendFallback()).verifyProof(proofJson)
        : false;
    }
    // PORT-192: invoke native verifier
    try {
      const result = this.runner(
        this.binaryPath!,
        ['verify', '--proof', '-'],
        proofJson,
        this.timeoutMs,
      );
      return result.status === 0;
    } catch { return false; }
  }

  getStats(): Readonly<Groth16BackendStats> { return { ...this.stats }; }

  private fallbackOrThrow(witnessJson: string, seed: number | undefined, reason: string): Promise<Groth16Proof> {
    if (this.options.allowSimulatedFallback === true) {
      return (this.options.fallbackBackend ?? new Groth16BackendFallback()).generateProof(witnessJson, seed);
    }
    return Promise.reject(new Error(`${reason}; pass allowSimulatedFallback:true to use Groth16BackendFallback`));
  }
}

// ---------------------------------------------------------------------------
// Groth16BackendFallback (simulated — for testing only)
// ---------------------------------------------------------------------------

/**
 * Simulated Groth16 backend for testing and educational use.
 *
 * **NOT cryptographically secure.** Do not use in production.
 *
 * TypeScript port of `Groth16BackendFallback` from `groth16_ffi.py`.
 */
export class Groth16BackendFallback implements ZKPBackendProtocol {
  async generateProof(witnessJson: string, seed = 0): Promise<Groth16Proof> {
    // Produce a deterministic pseudo-proof based on witness hash
    const hash = createHash('sha256').update(witnessJson + seed).digest();
    return new Groth16Proof(
      new Uint8Array(hash),
      { witnessHash: hash.toString('hex').slice(0, 32) },
      { backend: 'simulated', seed },
      Date.now(),
      hash.length,
    );
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    // Simulated verification: accept any valid JSON
    try { JSON.parse(proofJson); return true; } catch { return false; }
  }
}

// ---------------------------------------------------------------------------
// ProveKitFFI (stub)
// ---------------------------------------------------------------------------

export class ProveKitFFIError extends Error {
  constructor(message: string) { super(message); this.name = 'ProveKitFFIError'; }
}

/**
 * ProveKit FFI interface (requires native shared library).
 *
 * TypeScript stub of `ProveKitFFI` from `provekit_ffi.py`.
 *
 * Actual proof generation requires a compiled Rust library loaded via
 * `ffi-napi` or similar. This stub implements the interface so callers
 * can feature-detect availability without crashing.
 */
export class ProveKitFFI implements ZKPBackendProtocol {
  private readonly libPath: string | null;

  constructor(
    libPath: string | null = null,
    private readonly cliPath = 'provekit',
    private readonly runner: ZKPProcessRunner = defaultProcessRunner,
  ) {
    this.libPath = libPath;
  }

  static discover(): ProveKitFFI {
    // Search common locations for the native library
    const candidates = [
      './libprovekit.so', './libprovekit.dylib', './provekit.dll',
    ];
    try {
      const { existsSync } = require('node:fs') as { existsSync: (p: string) => boolean };
      for (const p of candidates) { if (existsSync(p)) return new ProveKitFFI(p); }
    } catch { /* ignore */ }
    return new ProveKitFFI(null);
  }

  isAvailable(): boolean { return this.libPath !== null; }

  async generateProof(witnessJson: string, seed?: number): Promise<Groth16Proof> {
    if (!this.isAvailable()) {
      throw new ProveKitFFIError('ProveKit native library not available');
    }
    // PORT-193: invoke ProveKit CLI when native library is present
    try {
      const result = this.runner(
        this.cliPath,
        ['prove', '--lib', this.libPath!, '--witness', '-'],
        witnessJson,
        60_000,
      );
      if (result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        const hash = createHash('sha256').update(witnessJson + (seed ?? 0)).digest();
        return new Groth16Proof(
          Buffer.from(String(parsed['proof'] ?? ''), 'hex'),
          parsed['public_inputs'] as Record<string, string>,
          { backend: 'provekit', lib: this.libPath },
          Date.now(),
          result.stdout.length,
        );
      }
    } catch { /* fall through to error */ }
    throw new ProveKitFFIError('ProveKit CLI invocation failed');
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new ProveKitFFIError('ProveKit native library not available');
    }
    // PORT-193: invoke ProveKit verifier via CLI
    try {
      const result = this.runner(
        this.cliPath,
        ['verify', '--lib', this.libPath!, '--proof', '-'],
        proofJson,
        60_000,
      );
      return result.status === 0;
    } catch {
      throw new ProveKitFFIError('ProveKit verify CLI failed');
    }
  }
}
