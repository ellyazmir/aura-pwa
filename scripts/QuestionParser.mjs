/**
 * ocrPreprocess â€” clean an image before Tesseract reads it.
 *
 * Tesseract's layout analysis treats table borders as content and often returns
 * garbage for the cells inside a bordered table. This erases long straight
 * horizontal and vertical lines (painting them background-white) while leaving
 * everything else untouched, so Tesseract sees only the text.
 *
 * Pure function over RGBA pixel data: no DOM, so it can be unit tested.
 */

/** Pixel runs shorter than this fraction of the image side are never erased. */
const LINE_FRACTION = 0.15;
/**
 * Absolute floor in pixels. Keeps short strokes such as fraction bars, minus
 * signs and underlines under words from being mistaken for table borders.
 */
const MIN_LINE_PX = 100;
/** A line may be broken by up to this many light pixels (anti-aliasing, noise). */
const MAX_GAP = 2;

/**
 * Otsu's method: the grey level that best separates dark ink from background.
 * @param {Uint8Array} gray
 * @returns {number}
 */
function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;

  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i];

  let sumBg = 0;
  let weightBg = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t += 1) {
    weightBg += hist[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const variance = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/**
 * Find runs of ink along one axis that are at least `minLen` long and mark them
 * in `erase`.
 *
 * @param {Uint8Array} dark 1 where a pixel is ink
 * @param {Uint8Array} erase output mask, set to 1 for pixels to remove
 * @param {number} width
 * @param {number} height
 * @param {boolean} horizontal scan rows when true, columns when false
 * @param {number} minLen
 */
function markLongRuns(dark, erase, width, height, horizontal, minLen) {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const at = (line, pos) => (horizontal ? line * width + pos : pos * width + line);

  for (let line = 0; line < lines; line += 1) {
    let start = -1;
    let lastInk = -1;
    for (let pos = 0; pos <= length; pos += 1) {
      const ink = pos < length && dark[at(line, pos)] === 1;
      if (ink) {
        if (start === -1) start = pos;
        lastInk = pos;
      } else if (start !== -1 && (pos === length || pos - lastInk > MAX_GAP)) {
        if (lastInk - start + 1 >= minLen) {
          for (let p = start; p <= lastInk; p += 1) erase[at(line, p)] = 1;
        }
        start = -1;
      }
    }
  }
}

/**
 * Spread ink `radius` pixels across the scan direction (up/down for horizontal
 * lines, left/right for vertical ones) so a slightly tilted line forms one
 * unbroken run instead of a staircase of short ones.
 * @param {Uint8Array} dark
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @param {boolean} horizontal true when scanning rows
 * @returns {Uint8Array}
 */
function smear(dark, width, height, radius, horizontal) {
  const out = new Uint8Array(dark.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (dark[y * width + x] !== 1) continue;
      for (let d = -radius; d <= radius; d += 1) {
        const yy = horizontal ? y + d : y;
        const xx = horizontal ? x : x + d;
        if (yy >= 0 && yy < height && xx >= 0 && xx < width) out[yy * width + xx] = 1;
      }
    }
  }
  return out;
}

/**
 * Return a copy of the image with long straight lines painted white.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba pixel data, 4 bytes per pixel
 * @param {number} width
 * @param {number} height
 * @param {{ tolerance?: number }} [options] `tolerance` (pixels, default 0) lets a
 *   line wander that far off level, so slightly tilted photos still count as
 *   straight lines. 2 handles about 1 degree of residual tilt.
 * @returns {Uint8ClampedArray} cleaned RGBA data, same dimensions
 */
export function removeGridLines(rgba, width, height, options = {}) {
  const tolerance = Math.max(0, Math.floor(options.tolerance ?? 0));
  const count = width * height;
  const gray = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    gray[i] = (rgba[o] * 299 + rgba[o + 1] * 587 + rgba[o + 2] * 114) / 1000;
  }

  const threshold = otsuThreshold(gray);
  const dark = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) dark[i] = gray[i] <= threshold ? 1 : 0;

  const erase = new Uint8Array(count);
  const darkH = tolerance ? smear(dark, width, height, tolerance, true) : dark;
  const darkV = tolerance ? smear(dark, width, height, tolerance, false) : dark;
  markLongRuns(darkH, erase, width, height, true, Math.max(MIN_LINE_PX, width * LINE_FRACTION));
  markLongRuns(darkV, erase, width, height, false, Math.max(MIN_LINE_PX, height * LINE_FRACTION));

  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < count; i += 1) {
    if (erase[i] === 1) {
      const o = i * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = 255;
    }
  }
  return out;
}