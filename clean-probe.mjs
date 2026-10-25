// Throwaway: run removeGridLines on raw RGBA and write a PNG-able BMP via raw -> file.
import { readFileSync, writeFileSync } from 'node:fs';
import { removeGridLines } from './src/backend/ocrPreprocess.js';

const [w, h] = [1000, 420];
const rgba = new Uint8ClampedArray(readFileSync('q44.rgba'));
const t0 = performance.now();
const cleaned = removeGridLines(rgba, w, h);
console.log('removeGridLines ms', Math.round(performance.now() - t0));

let changed = 0;
for (let i = 0; i < rgba.length; i += 4) if (rgba[i] !== cleaned[i]) changed += 1;
console.log('pixels erased', changed);
writeFileSync('q44-clean.rgba', Buffer.from(cleaned));
