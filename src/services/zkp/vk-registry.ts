/**
 * vk-registry.ts
 *
 * Verifying-key (VK) registry — PORT-195 (part 4 of 4).
 * TypeScript port of:
 *   ipfs_datasets_py/logic/zkp/vk_registry.py (155L)
 *
 * Provides:
 *   VKRegistryEntry    — one circuit's VK record
 *   VKRegistry         — load/lookup/update/export VKs
 *   registerVK()       — module-level helper
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import type { VerificationKey } from './zkp-verifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VKRegistryEntry {
  readonly circuitId:   string;
  readonly vk:          VerificationKey;
  readonly registeredAt: number;
  readonly tags:        string[];
  readonly description: string;
}

export interface VKRegistryStats {
  totalEntries: number;
  byAlgorithm:  Record<string, number>;
}

// ---------------------------------------------------------------------------
// VKRegistry
// ---------------------------------------------------------------------------

/**
 * Registry mapping circuit IDs to their verifying keys.
 *
 * In production the registry would be persisted on-chain or in IPFS.
 * This in-memory implementation provides the same API.
 *
 * PORT-195: mirrors `VKRegistry` from `vk_registry.py`.
 */
export class VKRegistry {
  private readonly entries = new Map<string, VKRegistryEntry>();

  register(
    circuitId: string,
    vk: VerificationKey,
    opts: { tags?: string[]; description?: string } = {},
  ): VKRegistryEntry {
    const entry: VKRegistryEntry = {
      circuitId,
      vk,
      registeredAt: Date.now(),
      tags:         opts.tags ?? [],
      description:  opts.description ?? '',
    };
    this.entries.set(circuitId, entry);
    return entry;
  }

  lookup(circuitId: string): VKRegistryEntry | null {
    return this.entries.get(circuitId) ?? null;
  }

  getVK(circuitId: string): VerificationKey | null {
    return this.entries.get(circuitId)?.vk ?? null;
  }

  has(circuitId: string): boolean {
    return this.entries.has(circuitId);
  }

  list(): VKRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Export all VKs as a plain JSON payload (for on-chain posting).
   */
  exportPayload(): Record<string, unknown> {
    const entries: Record<string, unknown> = {};
    for (const [id, entry] of this.entries) {
      entries[id] = {
        vk:            entry.vk,
        registeredAt:  entry.registeredAt,
        tags:          entry.tags,
        description:   entry.description,
      };
    }
    const payloadHash = sha256Hex(JSON.stringify(entries));
    return { entries, payloadHash, exportedAt: Date.now() };
  }

  /**
   * Import a registry payload (from on-chain or IPFS).
   */
  importPayload(payload: Record<string, unknown>): number {
    const entries = payload['entries'] as Record<string, unknown> | undefined;
    if (!entries) return 0;
    let count = 0;
    for (const [circuitId, raw] of Object.entries(entries)) {
      const rec = raw as Record<string, unknown>;
      const vk  = rec['vk'] as VerificationKey;
      if (vk && vk.keyId) {
        this.entries.set(circuitId, {
          circuitId,
          vk,
          registeredAt: Number(rec['registeredAt'] ?? Date.now()),
          tags:         (rec['tags'] as string[] | undefined) ?? [],
          description:  String(rec['description'] ?? ''),
        });
        count++;
      }
    }
    return count;
  }

  stats(): VKRegistryStats {
    const byAlgorithm: Record<string, number> = {};
    for (const entry of this.entries.values()) {
      byAlgorithm[entry.vk.algorithm] = (byAlgorithm[entry.vk.algorithm] ?? 0) + 1;
    }
    return { totalEntries: this.entries.size, byAlgorithm };
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

const _registry = new VKRegistry();

export function registerVK(circuitId: string, vk: VerificationKey, opts?: { tags?: string[]; description?: string }): VKRegistryEntry {
  return _registry.register(circuitId, vk, opts ?? {});
}

export function lookupVK(circuitId: string): VerificationKey | null {
  return _registry.getVK(circuitId);
}

export function getVKRegistry(): VKRegistry { return _registry; }
