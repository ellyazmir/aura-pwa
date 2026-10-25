/**
 * ocrNormalize — even out uneven lighting in a photographed page.
 *
 * Phone photos of printed pages usually carry a shadow or a brightness gradient
 * (a hand, a book spine, a lamp). Otsu thresholding in removeGridLines and
 * Tesseract's own binarisation both treat a dark shadow as ink, so text inside
 * it is lost or the whole shaded area is "erased" as a long line.
 *
 * Method: estimate the paper brightness on a coarse grid (the brightest pixel in
 * each cell, lightly smoothed), upsample it bilinearly, and divide each pixel by
 * it. Paper becomes white everywhere, ink stays dark. Output is greyscale RGBA.
 *
 * Pure function over RGBA pixel data: no DOM, so it can be unit tested.
 */

/** Cell size of the background grid in pixels. Must exceed stroke thickness. */
const CELL = 24;

/**
 * @param {Uint8ClampedArray|Uint8Array} rgba pixel data, 4 bytes per pixel
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} greyscale RGBA, same dimensions
 */
export function flattenIllumination(rgba, width, height) {
  const count = width * height;
  const gray = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    gray[i] = (rgba[o] * 299 + rgba[o + 1] * 587 + rgba[o + 2] * 114) / 1000;
  }

  const gw = Math.max(1, Math.ceil(width / CELL));
  const gh = Math.max(1, Math.ceil(height / CELL));

  // Brightest pixel per cell approximates the paper under that cell.
  const peak = new Float32Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / CELL) * gw;
    for (let x = 0; x < width; x += 1) {
      const c = row + Math.floor(x / CELL);
      const v = gray[y * width + x];
      if (v > peak[c]) peak[c] = v;
    }
  }

  // 3x3 box smoothing so one bright speck does not create a hot spot.
  const bg = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const yy = gy + dy;
          const xx = gx + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) {
            sum += peak[yy * gw + xx];
            n += 1;
          }
        }
      }
      bg[gy * gw + gx] = sum / n;
    }
  }

  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y += 1) {
    // Position in grid space, centred on cells.
    const fy = Math.min(gh - 1, Math.max(0, y / CELL - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.min(gw - 1, Math.max(0, x / CELL - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;

      const top = bg[y0 * gw + x0] * (1 - tx) + bg[y0 * gw + x1] * tx;
      const bottom = bg[y1 * gw + x0] * (1 - tx) + bg[y1 * gw + x1] * tx;
      const paper = Math.max(1, top * (1 - ty) + bottom * ty);

      const v = Math.min(255, (gray[y * width + x] * 255) / paper);
      const o = (y * width + x) * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ dark blocks */

const BLOCK_CELL = 6; // grid cell in pixels
const BLOCK_DARK = 80; // grey level below which a pixel counts as black fill
const BLOCK_CELL_FRACTION = 0.35; // share of dark pixels that makes a cell dark
const BLOCK_MIN_W = 80;
const BLOCK_MIN_H = 24;
const BLOCK_MIN_FILL = 0.5; // share of the bounding box that must be dark cells
const BLOCK_PAD = 6;

/**
 * Paint large solid dark rectangles white. Exam pages carry white-on-black tags
 * (for example "SMK MR2 2025"); inverted text reads as junk words and the bar
 * edges create fake columns. Ordinary text, pen marks and thin table borders are
 * far too sparse to qualify.
 *
 * Run this on the raw photo, before flattenIllumination.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} copy with dark blocks painted white
 */
export function removeDarkBlocks(rgba, width, height) {
  const gw = Math.ceil(width / BLOCK_CELL);
  const gh = Math.ceil(height / BLOCK_CELL);
  const dark = new Uint8Array(gw * gh);
  const counts = new Uint16Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / BLOCK_CELL) * gw;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const g = (rgba[o] * 299 + rgba[o + 1] * 587 + rgba[o + 2] * 114) / 1000;
      if (g < BLOCK_DARK) counts[row + Math.floor(x / BLOCK_CELL)] += 1;
    }
  }
  const need = BLOCK_CELL * BLOCK_CELL * BLOCK_CELL_FRACTION;
  for (let i = 0; i < dark.length; i += 1) dark[i] = counts[i] >= need ? 1 : 0;

  const out = new Uint8ClampedArray(rgba);
  const seen = new Uint8Array(dark.length);
  for (let start = 0; start < dark.length; start += 1) {
    if (!dark[start] || seen[start]) continue;
    // Flood fill one connected component of dark cells.
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    let minX = gw; let maxX = 0; let minY = gh; let maxY = 0;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % gw;
      const cy = (c - cx) / gw;
      n += 1;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      if (cx > 0 && dark[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (cx < gw - 1 && dark[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (cy > 0 && dark[c - gw] && !seen[c - gw]) { seen[c - gw] = 1; stack.push(c - gw); }
      if (cy < gh - 1 && dark[c + gw] && !seen[c + gw]) { seen[c + gw] = 1; stack.push(c + gw); }
    }
    const cellsW = maxX - minX + 1;
    const cellsH = maxY - minY + 1;
    if (cellsW * BLOCK_CELL < BLOCK_MIN_W || cellsH * BLOCK_CELL < BLOCK_MIN_H) continue;
    if (n / (cellsW * cellsH) < BLOCK_MIN_FILL) continue;

    const x0 = Math.max(0, minX * BLOCK_CELL - BLOCK_PAD);
    const x1 = Math.min(width, (maxX + 1) * BLOCK_CELL + BLOCK_PAD);
    const y0 = Math.max(0, minY * BLOCK_CELL - BLOCK_PAD);
    const y1 = Math.min(height, (maxY + 1) * BLOCK_CELL + BLOCK_PAD);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const o = (y * width + x) * 4;
        out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; out[o + 3] = 255;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ skew */

const SKEW_MAX_DEG = 6;
const SKEW_INK = 150; // grey level below which a pixel is ink (after flattening)
const SKEW_TARGET_W = 600; // analyse a downscaled copy

/**
 * Estimate how many degrees to rotate the page CLOCKWISE so text lines become
 * horizontal. Tries angles and keeps the one where ink piles up into the
 * sharpest horizontal bands (largest variance of the row histogram).
 *
 * Run on the output of flattenIllumination (paper white, ink dark).
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {number} degrees, 0 when the page is already straight
 */
export function estimateSkew(rgba, width, height) {
  const step = Math.max(1, Math.floor(width / SKEW_TARGET_W));
  const xs = [];
  const ys = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (rgba[(y * width + x) * 4] < SKEW_INK) {
        xs.push(x / step);
        ys.push(y / step);
      }
    }
  }
  if (xs.length < 50) return 0;

  const bins = Math.ceil(height / step) + Math.ceil(width / step) + 2;
  const offset = Math.ceil(width / step) + 1;
  const hist = new Float64Array(bins);

  const scoreAt = (deg) => {
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    hist.fill(0);
    for (let i = 0; i < xs.length; i += 1) {
      const r = Math.round(ys[i] * cos + xs[i] * sin) + offset;
      if (r >= 0 && r < bins) hist[r] += 1;
    }
    let s = 0;
    for (let i = 0; i < bins; i += 1) s += hist[i] * hist[i];
    return s;
  };

  let best = 0;
  let bestScore = -1;
  for (let d = -SKEW_MAX_DEG; d <= SKEW_MAX_DEG; d += 0.5) {
    const s = scoreAt(d);
    if (s > bestScore) { bestScore = s; best = d; }
  }
  const coarse = best;
  for (let d = coarse - 0.5; d <= coarse + 0.5; d += 0.1) {
    const s = scoreAt(d);
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return Math.abs(best) < 0.2 ? 0 : Number(best.toFixed(1));
}

/**
 * Pixel-level cleanup that needs no DOM: black tags out, lighting flattened, skew measured.
 * The caller rotates by `angle` degrees clockwise (canvas ctx.rotate or sharp.rotate) and
 * then runs removeGridLines on the straightened image.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {{ pixels: Uint8ClampedArray, angle: number }}
 */
export function cleanPage(rgba, width, height) {
  const noBlocks = removeDarkBlocks(rgba, width, height);
  const flat = flattenIllumination(noBlocks, width, height);
  return { pixels: flat, angle: estimateSkew(flat, width, height) };
}