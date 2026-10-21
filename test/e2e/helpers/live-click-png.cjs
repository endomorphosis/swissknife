/**
 * Visual file checks for one live-click PNG.
 * A passing image is a real PNG, at least 8 KB, and not a single color.
 */

const zlib = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MIN_PNG_BYTES = 8192;

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function unfilter(filter, row, previous, bytesPerPixel) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index];
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    if (filter === 1) row[index] = (row[index] + left) & 255;
    else if (filter === 2) row[index] = (row[index] + up) & 255;
    else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[index] = (row[index] + paeth(left, up, upLeft)) & 255;
    else if (filter !== 0) throw new Error(`unsupported png filter ${filter}`);
  }
}

function inspectPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_PNG_BYTES) {
    return { ok: false, reason: 'png-too-small', bytes: buffer ? buffer.length : 0, colors: 0 };
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, reason: 'png-signature', bytes: buffer.length, colors: 0 };
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      return { ok: false, reason: 'png-truncated', bytes: buffer.length, colors: 0 };
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (width < 2 || height < 2 || interlace !== 0 || bitDepth !== 8 || ![0, 2, 6].includes(colorType)) {
    return { ok: false, reason: 'png-undecodable', bytes: buffer.length, colors: 0 };
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat));
  } catch (error) {
    return { ok: false, reason: 'png-inflate', bytes: buffer.length, colors: 0 };
  }
  const stride = width * bytesPerPixel;
  const colors = new Set();
  let cursor = 0;
  let previous = Buffer.alloc(stride);
  const sampleStep = Math.max(1, Math.floor((width * height) / 5000));
  let pixelIndex = 0;
  for (let y = 0; y < height; y += 1) {
    if (cursor + 1 + stride > inflated.length) {
      return { ok: false, reason: 'png-short-scanline', bytes: buffer.length, colors: colors.size };
    }
    const filter = inflated[cursor];
    cursor += 1;
    const row = Buffer.from(inflated.subarray(cursor, cursor + stride));
    cursor += stride;
    try {
      unfilter(filter, row, previous, bytesPerPixel);
    } catch (error) {
      return { ok: false, reason: 'png-filter', bytes: buffer.length, colors: 0 };
    }
    for (let x = 0; x < width; x += 1) {
      if (pixelIndex % sampleStep === 0) {
        const start = x * bytesPerPixel;
        const red = row[start];
        const green = bytesPerPixel > 1 ? row[start + 1] : red;
        const blue = bytesPerPixel > 2 ? row[start + 2] : red;
        colors.add(`${red},${green},${blue}`);
        if (colors.size > 1) {
          return { ok: true, reason: 'png-ok', bytes: buffer.length, colors: colors.size };
        }
      }
      pixelIndex += 1;
    }
    previous = row;
  }
  return {
    ok: false,
    reason: colors.size <= 1 ? 'png-single-color' : 'png-ok',
    bytes: buffer.length,
    colors: colors.size,
  };
}

function encodeTestPng(width, height, paint) {
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y);
      const pixel = rowStart + 1 + x * bytesPerPixel;
      raw[pixel] = red;
      raw[pixel + 1] = green;
      raw[pixel + 2] = blue;
    }
  }
  const idat = zlib.deflateSync(raw);
  const signature = PNG_SIGNATURE;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  function chunk(type, data) {
    const body = Buffer.alloc(12 + data.length);
    body.writeUInt32BE(data.length, 0);
    body.write(type, 4, 'ascii');
    data.copy(body, 8);
    const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(type), data])) : 0;
    body.writeUInt32BE(crc >>> 0, 8 + data.length);
    return body;
  }
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function selfTest() {
  const flat = encodeTestPng(80, 80, () => [20, 20, 20]);
  const flatResult = inspectPng(Buffer.concat([flat, Buffer.alloc(MIN_PNG_BYTES)]));
  if (flatResult.reason !== 'png-single-color' && flatResult.ok) {
    throw new Error(`flat png should fail, got ${flatResult.reason}`);
  }
  const mixed = encodeTestPng(80, 80, (x) => (x < 40 ? [10, 20, 30] : [200, 180, 40]));
  const padded = Buffer.concat([mixed, Buffer.alloc(Math.max(0, MIN_PNG_BYTES - mixed.length))]);
  const mixedResult = inspectPng(padded);
  if (!mixedResult.ok) throw new Error(`mixed png should pass, got ${mixedResult.reason}`);
  const tiny = inspectPng(Buffer.from('not a png'));
  if (tiny.ok || tiny.reason !== 'png-too-small') throw new Error('tiny png should fail size');
  console.log('live-click-png self-test ok');
}

module.exports = { inspectPng, MIN_PNG_BYTES, selfTest };

if (require.main === module) selfTest();
