/**
 * Copies the Tesseract.js worker, WASM core and language data from node_modules
 * into public/tesseract so the OCR engine is self-hosted and works offline.
 * Runs on postinstall, predev and prebuild.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'tesseract');

const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];
// "best_int" is the small (~1-3 MB) integer model; Tesseract.js expects <lang>.traineddata.gz.
const LANGS = ['eng', 'msa'];

function copy(from, to) {
  if (!existsSync(from)) {
    console.error(`[ocr-assets] missing source: ${from}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

copy(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
for (const f of CORE_FILES) copy(join(nm, 'tesseract.js-core', f), join(out, 'core', f));
for (const l of LANGS) {
  copy(
    join(nm, '@tesseract.js-data', l, '4.0.0_best_int', `${l}.traineddata.gz`),
    join(out, 'lang', `${l}.traineddata.gz`),
  );
}
console.log('[ocr-assets] copied to public/tesseract');
