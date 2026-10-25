// Throwaway probe: run Tesseract.js (Node build) on a test image using the same
// local files the browser will use, and print what it detects.
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const image = process.argv[2];
const t0 = Date.now();

const worker = await createWorker(['eng', 'msa'], 1, {
  langPath: join(here, 'public', 'tesseract', 'lang'),
  gzip: true,
  cachePath: join(here, '.ocr-cache'),
});
console.log('init ms', Date.now() - t0); await worker.setParameters({ tessedit_pageseg_mode: process.argv[3] || '3', preserve_interword_spaces: '1' }); console.log('PSM', process.argv[3] || '3');

const t1 = Date.now();
const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
console.log('recognize ms', Date.now() - t1);
console.log('page confidence', data.confidence);
console.log('--- text ---');
console.log(data.text);
console.log('--- lines ---');
for (const block of data.blocks ?? []) {
  for (const para of block.paragraphs) {
    for (const line of para.lines) {
      const sup = line.words
        .flatMap((w) => w.symbols)
        .filter((s) => s.is_superscript)
        .map((s) => s.text)
        .join('');
      const b = line.bbox;
      console.log(
        JSON.stringify(line.text.trim()),
        `x0=${b.x0} y0=${b.y0} x1=${b.x1} y1=${b.y1} conf=${Math.round(line.confidence)}`,
        sup ? `superscript=[${sup}]` : ''
      );
    }
  }
}
await worker.terminate();

