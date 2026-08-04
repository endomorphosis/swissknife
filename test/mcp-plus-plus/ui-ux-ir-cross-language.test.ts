/**
 * UIR-062: TypeScript side of cross-language golden vector parity.
 *
 * Loads the Python-authored golden_vectors.json and checks that the SwissKnife
 * codec produces the same canonical sha256 for valid documents and fails closed
 * on invalid documents.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  canonicalizeUiIr,
  decodeUiIr,
  uiIrSha256,
  UI_UX_IR_SCHEMA_VERSION,
} from '../../src/services/mcp/ui-ux-ir-codec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveGoldenPath(): string {
  const candidates = [
    // monorepo: swissknife/test/... → ../../external/ipfs_datasets/...
    join(
      __dirname,
      '../../../external/ipfs_datasets/tests/fixtures/ui_ux_ir/v1/golden_vectors.json',
    ),
    // worktree with swissknife as submodule sibling layout
    join(
      __dirname,
      '../../../../external/ipfs_datasets/tests/fixtures/ui_ux_ir/v1/golden_vectors.json',
    ),
  ];
  for (const path of candidates) {
    try {
      readFileSync(path, 'utf8');
      return path;
    } catch {
      // try next
    }
  }
  throw new Error(`golden_vectors.json not found; tried: ${candidates.join(', ')}`);
}

interface GoldenFile {
  interface: string;
  schema_version?: string;
  vectors: Array<{
    id: string;
    kind: string;
    document?: Record<string, unknown>;
    canonical_sha256?: string;
    canonical_utf8_length?: number;
    payload?: Record<string, unknown>;
    semantic?: Record<string, unknown>;
  }>;
}

describe('UIR-062 cross-language golden parity', () => {
  const golden: GoldenFile = JSON.parse(readFileSync(resolveGoldenPath(), 'utf8'));

  it('declares UIIRCrossLanguageParity@1', () => {
    expect(golden.interface).toBe('UIIRCrossLanguageParity@1');
    expect(golden.vectors.length).toBeGreaterThan(0);
  });

  it('matches Python canonical sha256 for valid documents', () => {
    const valids = golden.vectors.filter((v) => v.kind === 'valid_document');
    expect(valids.length).toBeGreaterThan(0);
    for (const vector of valids) {
      expect(vector.document).toBeTruthy();
      const decoded = decodeUiIr(vector.document!);
      expect(decoded.schema_version).toBe(UI_UX_IR_SCHEMA_VERSION);
      const digest = uiIrSha256(decoded);
      expect(digest).toBe(vector.canonical_sha256);
      const bytes = canonicalizeUiIr(decoded);
      if (typeof vector.canonical_utf8_length === 'number') {
        expect(bytes.byteLength).toBe(vector.canonical_utf8_length);
      }
    }
  });

  it('fails closed on invalid documents', () => {
    const invalids = golden.vectors.filter((v) => v.kind === 'invalid_document');
    expect(invalids.length).toBeGreaterThan(0);
    for (const vector of invalids) {
      expect(() => decodeUiIr(vector.document!)).toThrow();
    }
  });

  it('preserves decision/receipt fail-closed semantics', () => {
    for (const vector of golden.vectors) {
      if (vector.kind === 'decision') {
        const payload = vector.payload ?? {};
        const semantic = vector.semantic ?? {};
        if (payload.outcome !== 'allow') {
          expect(payload.can_execute).toBe(false);
        }
        if (semantic.can_execute === false) {
          expect(payload.can_execute).toBe(false);
        }
      }
      if (vector.kind === 'receipt') {
        const payload = vector.payload ?? {};
        const semantic = vector.semantic ?? {};
        if (semantic.has_invocation === false) {
          expect(payload.has_invocation).toBe(false);
        }
      }
    }
  });
});
