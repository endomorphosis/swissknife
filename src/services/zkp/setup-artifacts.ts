/**
 * setup-artifacts.ts
 *
 * ZKP proving/verifying-key setup artifact management — PORT-195 (part 3 of 4).
 * TypeScript port of:
 *   ipfs_datasets_py/logic/zkp/setup_artifacts.py (79L)
 *
 * Provides:
 *   SetupArtifact      — a proving/verifying key pair produced by trusted setup
 *   SetupArtifactStore — load/save/lookup setup artifacts
 *   runTrustedSetup()  — simulated trusted setup for a circuit
 */

import { createHash } from 'crypto';
import type { VerificationKey } from './zkp-verifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvingKey {
  readonly keyId:      string;
  readonly circuitId:  string;
  readonly algorithm:  'groth16' | 'provekit' | 'simulated';
  readonly parameters: Record<string, unknown>;
  readonly createdAt:  number;
}

export interface SetupArtifact {
  readonly circuitId:    string;
  readonly provingKey:   ProvingKey;
  readonly verifyingKey: VerificationKey;
  readonly algorithm:    string;
  readonly setupAt:      number;
  readonly version:      string;
}

export type TrustedSetupRunner = (params: {
  circuitId: string;
  algorithm: 'groth16' | 'provekit';
  version: string;
}) => SetupArtifact;

export interface TrustedSetupOptions {
  runner?: TrustedSetupRunner;
  allowSimulated?: boolean;
}

// ---------------------------------------------------------------------------
// SetupArtifactStore
// ---------------------------------------------------------------------------

/**
 * In-memory store for setup artifacts (proving/verifying key pairs).
 *
 * A real implementation would persist to disk/IPFS.
 * PORT-195: mirrors `SetupArtifactStore` from `setup_artifacts.py`.
 */
export class SetupArtifactStore {
  private readonly store = new Map<string, SetupArtifact>();

  put(artifact: SetupArtifact): void {
    this.store.set(artifact.circuitId, artifact);
  }

  get(circuitId: string): SetupArtifact | null {
    return this.store.get(circuitId) ?? null;
  }

  has(circuitId: string): boolean {
    return this.store.has(circuitId);
  }

  list(): SetupArtifact[] {
    return Array.from(this.store.values());
  }

  delete(circuitId: string): boolean {
    return this.store.delete(circuitId);
  }

  getProvingKey(circuitId: string): ProvingKey | null {
    return this.store.get(circuitId)?.provingKey ?? null;
  }

  getVerifyingKey(circuitId: string): VerificationKey | null {
    return this.store.get(circuitId)?.verifyingKey ?? null;
  }
}

// ---------------------------------------------------------------------------
// runTrustedSetup()
// ---------------------------------------------------------------------------

/**
 * Trusted setup for a given circuit.
 *
 * Native Groth16/ProveKit setup requires an injected runner. Deterministic
 * simulated setup is retained only when the caller explicitly requests
 * `algorithm: 'simulated'` or passes `allowSimulated:true`.
 */
export function runTrustedSetup(
  circuitId: string,
  algorithm: 'groth16' | 'provekit' | 'simulated' = 'groth16',
  version = '1.0.0',
  options: TrustedSetupOptions = {},
): SetupArtifact {
  if (algorithm !== 'simulated' && options.runner) {
    return options.runner({ circuitId, algorithm, version });
  }
  if (algorithm !== 'simulated' && options.allowSimulated !== true) {
    throw new Error(`Native ${algorithm} trusted setup runner not configured; pass algorithm:'simulated' for deterministic test artifacts`);
  }
  const seed = createHash('sha256').update(`${circuitId}:${algorithm}:${version}`).digest('hex');
  const now  = Date.now();

  const provingKey: ProvingKey = {
    keyId:      `pk-${seed.slice(0, 12)}`,
    circuitId,
    algorithm,
    parameters: { seed_fragment: seed.slice(0, 32), n_constraints: 1024 },
    createdAt:  now,
  };

  const verifyingKey: VerificationKey = {
    keyId:      `vk-${seed.slice(12, 24)}`,
    algorithm,
    parameters: { gamma: seed.slice(0, 16), delta: seed.slice(16, 32) },
    loadedAt:   now,
  };

  return { circuitId, provingKey, verifyingKey, algorithm, setupAt: now, version };
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

const _store = new SetupArtifactStore();

export function getOrCreateArtifact(
  circuitId: string,
  algorithm: 'groth16' | 'provekit' | 'simulated' = 'simulated',
  options: TrustedSetupOptions = {},
): SetupArtifact {
  if (!_store.has(circuitId)) {
    _store.put(runTrustedSetup(circuitId, algorithm, '1.0.0', algorithm === 'simulated' ? { allowSimulated: true, ...options } : options));
  }
  return _store.get(circuitId)!;
}

export function getSetupArtifactStore(): SetupArtifactStore { return _store; }
