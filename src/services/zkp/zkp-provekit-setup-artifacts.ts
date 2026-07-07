/**
 * ZKP setup artifact helpers.
 *
 * TypeScript port of ipfs_datasets_py/logic/zkp/setup_artifacts.py.
 */

import { existsSync } from 'node:fs';

export class Groth16SetupArtifacts {
  readonly provingKeyCid: string;
  readonly verifyingKeyCid: string;

  constructor(provingKeyCid: string, verifyingKeyCid: string) {
    this.provingKeyCid = provingKeyCid;
    this.verifyingKeyCid = verifyingKeyCid;
  }

  toDict(): Record<string, string> {
    return {
      proving_key_cid: this.provingKeyCid,
      verifying_key_cid: this.verifyingKeyCid,
    };
  }
}

export interface StoreGroth16SetupArtifactsOptions {
  pin?: boolean;
  backend?: string | null;
  backendInstance?: {
    addPath?: (path: string, options?: { recursive?: boolean; pin?: boolean; backend?: string | null }) => string | Promise<string>;
    add_path?: (path: string, options?: { recursive?: boolean; pin?: boolean; backend?: string | null }) => string | Promise<string>;
  } | null;
  addPath?: (path: string, options?: { recursive?: boolean; pin?: boolean; backend?: string | null }) => string | Promise<string>;
}

export async function storeGroth16SetupArtifactsInIpfs(
  manifest: Record<string, unknown>,
  options: StoreGroth16SetupArtifactsOptions = {},
): Promise<Record<string, unknown>> {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('manifest must be a dict');
  }

  const provingKeyPath = manifest.proving_key_path;
  const verifyingKeyPath = manifest.verifying_key_path;
  if (typeof provingKeyPath !== 'string' || !provingKeyPath) {
    throw new Error('manifest must contain non-empty proving_key_path');
  }
  if (typeof verifyingKeyPath !== 'string' || !verifyingKeyPath) {
    throw new Error('manifest must contain non-empty verifying_key_path');
  }
  if (!existsSync(provingKeyPath)) {
    throw new Error(`proving_key_path does not exist: ${provingKeyPath}`);
  }
  if (!existsSync(verifyingKeyPath)) {
    throw new Error(`verifying_key_path does not exist: ${verifyingKeyPath}`);
  }

  const addPath = resolveAddPath(options);
  const addOptions = {
    recursive: false,
    pin: options.pin ?? true,
    backend: options.backend ?? null,
  };
  const provingKeyCid = await addPath(provingKeyPath, addOptions);
  const verifyingKeyCid = await addPath(verifyingKeyPath, addOptions);
  return {
    ...manifest,
    proving_key_cid: provingKeyCid,
    verifying_key_cid: verifyingKeyCid,
  };
}

export const store_groth16_setup_artifacts_in_ipfs = storeGroth16SetupArtifactsInIpfs;

function resolveAddPath(options: StoreGroth16SetupArtifactsOptions): NonNullable<StoreGroth16SetupArtifactsOptions['addPath']> {
  if (options.addPath) return options.addPath;
  if (options.backendInstance?.addPath) return options.backendInstance.addPath.bind(options.backendInstance);
  if (options.backendInstance?.add_path) return options.backendInstance.add_path.bind(options.backendInstance);
  throw new Error('IPFS add_path backend is required');
}
