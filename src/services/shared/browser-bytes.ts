/**
 * Browser-safe byte helpers shared by service modules.
 *
 * These helpers intentionally avoid Node's Buffer so browser entrypoints do
 * not need a Buffer polyfill just to hash, sign, or encode MCP descriptors.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Map<string, number>(
  Array.from(BASE64_ALPHABET, (char, index) => [char, index]),
);

export type BytesLike = string | Uint8Array | ArrayBuffer | ArrayBufferView;

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(value: Uint8Array | ArrayBuffer | ArrayBufferView): string {
  return new TextDecoder().decode(toUint8Array(value));
}

export function toUint8Array(value: BytesLike): Uint8Array {
  if (typeof value === 'string') return utf8ToBytes(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function base64urlEncodeBytes(bytes: Uint8Array): string {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const byte1 = bytes[offset];
    const byte2 = bytes[offset + 1];
    const byte3 = bytes[offset + 2];
    const hasByte2 = offset + 1 < bytes.length;
    const hasByte3 = offset + 2 < bytes.length;
    const triplet = (byte1 << 16) | ((byte2 ?? 0) << 8) | (byte3 ?? 0);

    output += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    if (hasByte2) output += BASE64_ALPHABET[(triplet >> 6) & 0x3f];
    if (hasByte3) output += BASE64_ALPHABET[triplet & 0x3f];
  }
  return output.replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64urlDecodeToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  if (normalized.length % 4 === 1) {
    throw new Error('Invalid base64url length.');
  }

  const bytes: number[] = [];
  for (let offset = 0; offset < normalized.length; offset += 4) {
    const chunk = normalized.slice(offset, offset + 4);
    const sextets = Array.from(chunk, char => {
      const sextet = BASE64_LOOKUP.get(char);
      if (sextet === undefined) throw new Error(`Invalid base64url character: ${char}`);
      return sextet;
    });
    while (sextets.length < 4) sextets.push(0);

    const triplet =
      (sextets[0] << 18)
      | (sextets[1] << 12)
      | (sextets[2] << 6)
      | sextets[3];
    bytes.push((triplet >> 16) & 0xff);
    if (chunk.length > 2) bytes.push((triplet >> 8) & 0xff);
    if (chunk.length > 3) bytes.push(triplet & 0xff);
  }
  return new Uint8Array(bytes);
}
