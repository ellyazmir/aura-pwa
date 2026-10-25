/**
 * layout — rebuild reading order from OCR bounding boxes.
 *
 * Roboflow's EasyOCR workflow returns one prediction per detected text piece,
 * each with a centre point and size: { x, y, width, height, class }. Joining the
 * strings in detection order scrambles tables and multi-line problems, so this
 * groups detections into rows by vertical position and orders each row left to
 * right.
 *
 * Table cells: when at least two rows contain a wide horizontal gap, the gaps
 * are written as " | " so the columns stay readable. A single wide gap (for
 * example a blank in a sentence) is treated as a normal space.
 */

/** Row tolerance and column gap, both as a multiple of the median box height. */
const ROW_TOLERANCE = 0.6;
const COLUMN_GAP = 1.5;

/**
 * @param {Array<{ x?: number, y?: number, width?: number, height?: number,
 *   class?: string, text?: string }>} detections
 * @returns {string|null} text with one line per row, or null when the
 *   detections have no usable geometry (callers then keep their own ordering).
 */
export function layoutText(detections) {
  const items = (Array.isArray(detections) ? detections : [])
    .map((d) => ({
      s: String(d?.class ?? d?.text ?? '').trim(),
      x: d?.x,
      y: d?.y,
      w: d?.width,
      h: d?.height,
    }))
    .filter((i) => i.s);

  if (items.length === 0) return null;
  if (!items.every((i) => [i.x, i.y, i.w, i.h].every(Number.isFinite))) return null;

  const heights = items.map((i) => i.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 1;

  // Group into rows by vertical centre.
  const rows = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.y - row.cy) <= medianH * ROW_TOLERANCE) {
      row.items.push(item);
      row.cy = row.items.reduce((sum, i) => sum + i.y, 0) / row.items.length;
    } else {
      rows.push({ cy: item.y, items: [item] });
    }
  }

  // Order each row left to right and record where the wide gaps are.
  const built = rows.map((row) => {
    const ordered = row.items.sort((a, b) => a.x - b.x);
    const parts = ordered.map((item, index) => {
      if (index === 0) return { s: item.s, wide: false };
      const prev = ordered[index - 1];
      const gap = item.x - item.w / 2 - (prev.x + prev.w / 2);
      return { s: item.s, wide: gap > medianH * COLUMN_GAP };
    });
    return parts;
  });

  const isTable = built.filter((parts) => parts.some((p) => p.wide)).length >= 2;

  return built
    .map((parts) =>
      parts.map((p, index) => (index === 0 ? p.s : `${isTable && p.wide ? ' | ' : ' '}${p.s}`)).join('')
    )
    .join('\n');
}