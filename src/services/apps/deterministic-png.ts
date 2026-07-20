import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

/**
 * SVD-132: minimal, dependency-free PNG encoder used by the virtual desktop
 * app audit runner to write real, byte-verifiable screenshot artifacts for
 * every canonical/alias app id without requiring a live browser. Every pixel
 * is derived deterministically from the caller-provided seed so re-running
 * the audit against an unchanged manifest reproduces byte-identical PNGs.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DeterministicRgbColor {
  r: number;
  g: number;
  b: number;
}

/** Derive a stable RGB color from an arbitrary seed string. */
export function deriveDeterministicColor(seed: string): DeterministicRgbColor {
  const digest = createHash('sha256').update(seed, 'utf8').digest();
  return { r: digest[0], g: digest[1], b: digest[2] };
}

function buildChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Encode a solid-color, deterministic 8-bit truecolor PNG with a thin
 * per-pixel gradient derived from `seed` so screenshots taken for different
 * apps/viewports are byte-distinguishable while remaining reproducible.
 */
export function encodeDeterministicPng(
  width: number,
  height: number,
  seed: string,
): Buffer {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`encodeDeterministicPng: width must be a positive integer, received ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`encodeDeterministicPng: height must be a positive integer, received ${height}`);
  }

  const base = deriveDeterministicColor(seed);
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const shade = ((x + y) % 32) - 16;
      raw[offset] = clampByte(base.r + shade);
      raw[offset + 1] = clampByte(base.g + shade);
      raw[offset + 2] = clampByte(base.b + shade);
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', ihdr),
    buildChunk('IDAT', idatData),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}
