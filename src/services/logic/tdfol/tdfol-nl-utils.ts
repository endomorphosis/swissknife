import { bytesToHex, hexToBytes, sha256Hex } from '../../shared/shared-browser-crypto.js';

export const MULTIFORMATS_AVAILABLE = true;
export const HAVE_SPACY = false;

const RAW_CODEC = 0x55;
const SHA2_256 = 0x12;
const SHA2_256_LENGTH = 0x20;
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export interface ParsedCid {
  version: number;
  codec: string;
  hashfun: {
    name: string;
    digest: string;
  };
}

export function create_cache_cid(data: Record<string, unknown>): string {
  let json: string;
  try {
    json = canonicalJson(data);
  } catch (error) {
    throw new Error(`Failed to serialize data to JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const digest = hexToBytes(sha256Hex(json));
  const bytes = new Uint8Array(4 + digest.length);
  bytes.set([0x01, RAW_CODEC, SHA2_256, SHA2_256_LENGTH], 0);
  bytes.set(digest, 4);
  return `b${base32Encode(bytes)}`;
}

export const createCacheCid = create_cache_cid;

export function validate_cid(cid_str: string): boolean {
  try {
    parse_cid(cid_str);
    return true;
  } catch {
    return false;
  }
}

export const validateCid = validate_cid;

export function parse_cid(cid_str: string): ParsedCid {
  if (typeof cid_str !== 'string' || !cid_str.startsWith('b')) {
    throw new Error('Invalid CID: expected base32 multibase string');
  }

  const bytes = base32Decode(cid_str.slice(1));
  if (bytes.length !== 36 || bytes[0] !== 0x01 || bytes[1] !== RAW_CODEC || bytes[2] !== SHA2_256 || bytes[3] !== SHA2_256_LENGTH) {
    throw new Error('Invalid CID: expected CIDv1 raw sha2-256 multihash');
  }

  return {
    version: 1,
    codec: 'raw',
    hashfun: {
      name: 'sha2-256',
      digest: bytesToHex(bytes.slice(4)),
    },
  };
}

export const parseCid = parse_cid;

export function require_spacy(): void {
  throw new Error(
    'spaCy is required for natural language processing. Use SpacyWasmNlp or install a host spaCy bridge.',
  );
}

export const requireSpacy = require_spacy;

export function load_spacy_model(_model_name = 'en_core_web_sm'): never {
  require_spacy();
  throw new Error('unreachable');
}

export const loadSpacyModel = load_spacy_model;

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
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

function base32Decode(value: string): Uint8Array {
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of value.toLowerCase()) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid CID: invalid base32 character ${char}`);
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}
