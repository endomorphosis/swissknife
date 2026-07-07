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
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';

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

function defaultProcessRunner(command: string, args: string[], input: string, timeoutMs: number): ZKPProcessResult {
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

export interface Groth16BackendOptions {
  allowSimulatedFallback?: boolean;
  fallbackBackend?: ZKPBackendProtocol;
}

// ---------------------------------------------------------------------------
// Groth16Backend (real FFI — requires Rust binary)
// ---------------------------------------------------------------------------

/**
 * Real Groth16 zkSNARK backend.
 *
 * TypeScript port of `Groth16Backend` from `groth16_ffi.py`.
 *
 * By default, this backend is strict native-first and fails closed when the
 * configured binary is unavailable. Deterministic simulation remains available
 * only through explicit `allowSimulatedFallback:true` options.
 */
export class Groth16Backend implements ZKPBackendProtocol {
  private readonly stats: Groth16BackendStats = {
    proofsGenerated: 0, proofsVerified: 0, failures: 0, totalProofTimeMs: 0,
  };
  private readonly allowSimulatedFallback: boolean;
  private readonly fallbackBackend: ZKPBackendProtocol;

  constructor(
    private readonly binaryPath: string | null = null,
    private readonly timeoutMs = 30_000,
    private readonly runner: ZKPProcessRunner = defaultProcessRunner,
    options: Groth16BackendOptions = {},
  ) {
    this.allowSimulatedFallback = Boolean(options.allowSimulatedFallback);
    this.fallbackBackend = options.fallbackBackend ?? new Groth16BackendFallback();
  }

  isAvailable(): boolean {
    // In pure-TS runtime, the native binary is not available
    if (!this.binaryPath) return false;
    try { return fs.existsSync(this.binaryPath); } catch { return false; }
  }

  async generateProof(witnessJson: string, seed?: number): Promise<Groth16Proof> {
    const t0 = performance.now();
    this.stats.proofsGenerated++;

    if (!this.isAvailable()) {
      this.stats.failures++;
      this.stats.totalProofTimeMs += performance.now() - t0;
      if (this.allowSimulatedFallback) {
        return this.fallbackBackend.generateProof(witnessJson, seed);
      }
      throw new Error('Groth16 native backend unavailable. Configure a binary path or set allowSimulatedFallback:true for explicit test-only simulation.');
    }

    // PORT-192: spawn the real Groth16 binary when available
    try {
      const binaryPath = this.binaryPath;
      if (!binaryPath) {
        throw new Error('Groth16 binary path missing');
      }
      const result = this.runner(
        binaryPath,
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
    if (this.allowSimulatedFallback) {
      return this.fallbackBackend.generateProof(witnessJson, seed);
    }
    throw new Error('Groth16 native proof generation failed. Set allowSimulatedFallback:true only for explicit offline simulation.');
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    this.stats.proofsVerified++;
    if (!this.isAvailable()) {
      if (this.allowSimulatedFallback) {
        return this.fallbackBackend.verifyProof(proofJson);
      }
      return false;
    }
    // PORT-192: invoke native verifier
    try {
      const binaryPath = this.binaryPath;
      if (!binaryPath) {
        return false;
      }
      const result = this.runner(
        binaryPath,
        ['verify', '--proof', '-'],
        proofJson,
        this.timeoutMs,
      );
      return result.status === 0;
    } catch { return false; }
  }

  getStats(): Readonly<Groth16BackendStats> { return { ...this.stats }; }
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
      for (const p of candidates) { if (fs.existsSync(p)) return new ProveKitFFI(p); }
    } catch { /* ignore */ }
    return new ProveKitFFI(null);
  }

  isAvailable(): boolean { return this.libPath !== null; }

  async generateProof(witnessJson: string, seed?: number): Promise<Groth16Proof> {
    const libPath = this.libPath;
    if (!libPath) {
      throw new ProveKitFFIError('ProveKit native library not available');
    }
    // PORT-193: invoke ProveKit CLI when native library is present
    try {
      const result = this.runner(
        this.cliPath,
        ['prove', '--lib', libPath, '--witness', '-'],
        witnessJson,
        60_000,
      );
      if (result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        return new Groth16Proof(
          Buffer.from(String(parsed['proof'] ?? ''), 'hex'),
          parsed['public_inputs'] as Record<string, string>,
          { backend: 'provekit', lib: libPath, seed: seed ?? null },
          Date.now(),
          result.stdout.length,
        );
      }
    } catch { /* fall through to error */ }
    throw new ProveKitFFIError('ProveKit CLI invocation failed');
  }

  async verifyProof(proofJson: string): Promise<boolean> {
    const libPath = this.libPath;
    if (!libPath) {
      throw new ProveKitFFIError('ProveKit native library not available');
    }
    // PORT-193: invoke ProveKit verifier via CLI
    try {
      const result = this.runner(
        this.cliPath,
        ['verify', '--lib', libPath, '--proof', '-'],
        proofJson,
        60_000,
      );
      return result.status === 0;
    } catch {
      throw new ProveKitFFIError('ProveKit verify CLI failed');
    }
  }
}
