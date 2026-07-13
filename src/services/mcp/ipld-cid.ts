/** Browser-safe CIDv1 helpers for canonical DAG-JSON Profile D artifacts. */

import { hexToBytes, sha256Hex } from '../shared/shared-browser-crypto.js';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const CID_V1 = 1;
const DAG_JSON_CODEC = 0x0129;
const SHA2_256_CODE = 0x12;
const SHA2_256_LENGTH = 32;

/**
 * Canonical JSON suitable for a DAG-JSON block. Keys are sorted and strings
 * use ASCII JSON escapes so Python's `json.dumps(..., ensure_ascii=True)`
 * produces byte-identical content.
 */
export function canonicalDagJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return asciiJsonString(value);
  if (typeof value === 'boolean' || typeof value === 'number') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('DAG-JSON values must be finite JSON values');
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => item === undefined ? 'null' : canonicalDagJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
      .map(key => `${asciiJsonString(key)}:${canonicalDagJson(record[key])}`).join(',')}}`;
  }
  throw new Error(`DAG-JSON cannot encode ${typeof value}`);
}

/** Return a real CIDv1 with `dag-json` codec and `sha2-256` multihash. */
export function dagJsonCid(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalDagJson(value));
  const digest = hexToBytes(sha256Hex(bytes));
  const cid = Uint8Array.from([
    ...encodeVarint(CID_V1),
    ...encodeVarint(DAG_JSON_CODEC),
    SHA2_256_CODE,
    SHA2_256_LENGTH,
    ...digest,
  ]);
  return `b${base32Encode(cid)}`;
}

function asciiJsonString(value: string): string {
  return JSON.stringify(value).replace(/[\u0080-\u{10ffff}]/gu, character => {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
  });
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return bytes;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
