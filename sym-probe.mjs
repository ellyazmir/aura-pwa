import { createWorker } from 'tesseract.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const worker = await createWorker(['eng','msa'], 1, { langPath: join(here,'public','tesseract','lang'), gzip: true, cachePath: join(here,'.ocr-cache') });
const { data } = await worker.recognize(process.argv[2], {}, { blocks: true });
for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
  if (!/\d|\^|n|x/.test(w.text) || w.text.length > 4) continue;
  console.log(JSON.stringify(w.text), w.symbols.map(s => `${s.text}[y0=${s.bbox.y0},y1=${s.bbox.y1},sup=${s.is_superscript}]`).join(' '));
}
await worker.terminate();
