/**
 * Lossless PNG re-encoder with no dependencies (Node ≥ 22 for `zlib.crc32`).
 *
 * Chromium's `canvas.toDataURL('image/png')` compresses lightly; store screenshots at exact
 * App Store sizes (1290×2796) come out around 1 MB. Re-encoding the very same pixels with
 * per-row adaptive filtering, alpha dropped when every pixel is opaque, and zlib level 9
 * typically halves the file — with no change to a single pixel value or to the dimensions.
 *
 * Supports what Chromium writes: 8-bit RGB / RGBA, non-interlaced. Anything else is returned
 * unchanged.
 */
import { crc32, deflateSync, inflateSync, constants } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readChunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  return chunks;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(data, crc32(Buffer.from(type, 'latin1'))) >>> 0, 8 + data.length);
  return out;
}

/** [width, height] from the IHDR of any PNG buffer. */
export function pngSize(buf) {
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Reverse the per-row filters in place; returns raw pixel bytes (rows × stride). */
function unfilter(data, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const f = data[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[src++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = raw; break;
        case 1: v = raw + a; break;
        case 2: v = raw + b; break;
        case 3: v = raw + ((a + b) >> 1); break;
        case 4: v = raw + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${f}`);
      }
      out[row + x] = v & 0xff;
    }
  }
  return out;
}

/** Apply the filter that gives the smallest sum of absolute residuals on each row (libpng heuristic). */
function filterAdaptive(pixels, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  let dst = 0;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = row - stride;
    const sums = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = pixels[row + x];
      const a = x >= bpp ? pixels[row + x - bpp] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[prev + x - bpp] : 0;
      const r = [v, (v - a) & 0xff, (v - b) & 0xff, (v - ((a + b) >> 1)) & 0xff, (v - paeth(a, b, c)) & 0xff];
      for (let f = 0; f < 5; f++) {
        cand[f][x] = r[f];
        sums[f] += r[f] < 128 ? r[f] : 256 - r[f];
      }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f;
    out[dst++] = best;
    cand[best].copy(out, dst);
    dst += stride;
  }
  return out;
}

/**
 * Re-encode `buf` losslessly. Returns the smaller of the input and the re-encoded file, so it is
 * always safe to call.
 */
export function recompressPng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) return buf;

  const inBpp = colorType === 6 ? 4 : 3;
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  let pixels = unfilter(inflateSync(idat), width, height, inBpp);

  // drop the alpha channel when every pixel is opaque
  let bpp = inBpp;
  if (inBpp === 4) {
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 255) { opaque = false; break; }
    }
    if (opaque) {
      const rgb = Buffer.alloc(width * height * 3);
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
        rgb[j] = pixels[i];
        rgb[j + 1] = pixels[i + 1];
        rgb[j + 2] = pixels[i + 2];
      }
      pixels = rgb;
      bpp = 3;
    }
  }

  const filtered = filterAdaptive(pixels, width, height, bpp);
  let best = null;
  for (const strategy of [constants.Z_FILTERED, constants.Z_DEFAULT_STRATEGY]) {
    const z = deflateSync(filtered, { level: 9, memLevel: 9, windowBits: 15, strategy });
    if (!best || z.length < best.length) best = z;
  }

  const newIhdr = Buffer.from(ihdr);
  newIhdr[9] = bpp === 3 ? 2 : 6;
  const out = Buffer.concat([SIGNATURE, chunk('IHDR', newIhdr), chunk('IDAT', best), chunk('IEND', Buffer.alloc(0))]);
  return out.length < buf.length ? out : buf;
}
