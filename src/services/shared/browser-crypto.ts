/**
 * Small browser-safe encoding helpers for prover artifacts.
 *
 * These intentionally avoid Node's `crypto` and `Buffer` modules so the prover
 * path can be imported in browser bundles without polyfills.
 */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? utf8Bytes(input) : input;
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;

  const view = new DataView(message.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map(wordToHex).join('');
}

export function md5Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? utf8Bytes(input) : input;
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;

  const view = new DataView(message.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const k = md5Constants();
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const m = new Uint32Array(16);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const nextD = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + k[i] + m[g]) >>> 0, s[i])) >>> 0;
      a = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].map(wordToLittleEndianHex).join('');
}

export function base64UrlEncode(input: string | Uint8Array | ArrayBuffer | readonly number[]): string {
  const bytes = bytesFrom(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_URL[b1 >> 2];
    out += BASE64_URL[((b1 & 0x03) << 4) | (b2 >> 4)];
    if (i + 1 < bytes.length) out += BASE64_URL[((b2 & 0x0f) << 2) | (b3 >> 6)];
    if (i + 2 < bytes.length) out += BASE64_URL[b3 & 0x3f];
  }
  return out;
}

export function base64UrlDecode(input: string): Uint8Array {
  return base64Decode(input.replace(/-/g, '+').replace(/_/g, '/'));
}

export function base64Encode(input: string | Uint8Array | ArrayBuffer | readonly number[]): string {
  const bytes = bytesFrom(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const hasB2 = i + 1 < bytes.length;
    const hasB3 = i + 2 < bytes.length;
    const b2 = hasB2 ? bytes[i + 1] : 0;
    const b3 = hasB3 ? bytes[i + 2] : 0;
    out += BASE64[b1 >> 2];
    out += BASE64[((b1 & 0x03) << 4) | (b2 >> 4)];
    out += hasB2 ? BASE64[((b2 & 0x0f) << 2) | (b3 >> 6)] : '=';
    out += hasB3 ? BASE64[b3 & 0x3f] : '=';
  }
  return out;
}

export function base64Decode(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, '');
  if (clean.length % 4 === 1) throw new Error('invalid base64 input length');
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=');
  const out: number[] = [];

  for (let i = 0; i < padded.length; i += 4) {
    const c1 = base64Value(padded[i]);
    const c2 = base64Value(padded[i + 1]);
    const c3 = padded[i + 2] === '=' ? -1 : base64Value(padded[i + 2]);
    const c4 = padded[i + 3] === '=' ? -1 : base64Value(padded[i + 3]);
    if (c1 < 0 || c2 < 0 || (c3 < 0 && padded[i + 2] !== '=') || (c4 < 0 && padded[i + 3] !== '=')) {
      throw new Error('invalid base64 character');
    }
    if (c3 < 0 && c4 >= 0) throw new Error('invalid base64 padding');

    out.push((c1 << 2) | (c2 >> 4));
    if (c3 >= 0) out.push(((c2 & 0x0f) << 4) | (c3 >> 2));
    if (c4 >= 0 && c3 >= 0) out.push(((c3 & 0x03) << 6) | c4);
  }

  return new Uint8Array(out);
}

export function bytesToHex(input: Uint8Array | ArrayBuffer | readonly number[]): string {
  const bytes = bytesFrom(input);
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(input: string): Uint8Array {
  const clean = input.startsWith('0x') || input.startsWith('0X') ? input.slice(2) : input;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('hex input must contain an even number of hexadecimal characters');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function randomUUID(): string {
  const cryptoApi = globalThis.crypto as {
    randomUUID?: () => string;
    getRandomValues?: <T extends Uint8Array>(array: T) => T;
  } | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    const seed = sha256Hex(`${Date.now()}:${Math.random()}:${Math.random()}`);
    bytes.set(hexToBytes(seed.slice(0, 32)));
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function utf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(input);
  const bytes: number[] = [];
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

export function bytesFrom(input: string | Uint8Array | ArrayBuffer | readonly number[]): Uint8Array {
  if (typeof input === 'string') return utf8Bytes(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function rotl(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

function wordToHex(value: number): string {
  return value.toString(16).padStart(8, '0');
}

function base64Value(char: string): number {
  return BASE64.indexOf(char);
}

function wordToLittleEndianHex(value: number): string {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

let MD5_K: Uint32Array | null = null;

function md5Constants(): Uint32Array {
  if (MD5_K) return MD5_K;
  MD5_K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }
  return MD5_K;
}
