import { createWorker } from 'tesseract.js';

// 1. Fungsi OCR untuk baca gambar
export async function extractTextFromImage(imageFile) {
  try {
    const worker = await createWorker('eng');
    // Hanya benarkan nombor, huruf (x,y,z), dan simbol math
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789xyzXYZ=+-*/ ",
    });
    
    const ret = await worker.recognize(imageFile);
    await worker.terminate();
    
    let text = ret.data.text.replace(/\n/g, ' ').trim();
    text = text.replace(/\s+/g, ''); // Buang space
    return text;
  } catch (error) {
    console.error("OCR Error:", error);
    return "";
  }
}

// 2. Fungsi Solver (sama macam tadi)
export async function solveEquation(input, lang = 'en') {
  await new Promise(resolve => setTimeout(resolve, 800));
  
  let rawInput = typeof input === 'string' ? input : "2x + 5 = 13";
  let equation = rawInput.toLowerCase().replace(/\s+/g, ''); 

  const dict = {
    en: { sub: "Subtract", add: "Add", from: "from both sides", div: "Divide both sides by", err: "Multi-variable equations (like x and y) are not supported in this MVP. Please use a single variable like 2x + 5 = 15." },
    ms: { sub: "Tolak", add: "Tambah", from: "dari kedua-dua belah", div: "Bahagi kedua-dua belah dengan", err: "Persamaan dua pemboleh ubah (macam x dan y) belum disokong. Sila guna satu pemboleh ubah sahaja (contoh: 2x + 5 = 15)." }
  };
  const t = dict[lang] || dict.en;

  let sides = equation.split('=');
  if (sides.length !== 2) return errorResult(rawInput, lang, "Missing equals sign (=)");

  let left = sides[0];
  let right = sides[1];

  let variables = left.match(/[a-z]/g) || [];
  let uniqueVars = [...new Set(variables)]; 

  if (uniqueVars.length > 1) {
    return { problem: rawInput, steps: [t.err], answer: "Error" };
  }

  if (uniqueVars.length === 0) return errorResult(rawInput, lang, "No variable found (e.g., x)");

  let variable = uniqueVars[0]; 
  let varIndex = left.indexOf(variable);

  let aStr = left.substring(0, varIndex);
  let bStr = left.substring(varIndex + 1);

  let a = aStr === '' || aStr === '+' ? 1 : (aStr === '-' ? -1 : parseFloat(aStr));
  let b = bStr === '' ? 0 : parseFloat(bStr);
  let c = parseFloat(right);

  if (isNaN(a) || isNaN(b) || isNaN(c)) return errorResult(rawInput, lang, "Could not read numbers properly.");

  let steps = [];
  if (b !== 0) {
    let operation = b > 0 ? t.sub : t.add;
    steps.push(`${operation} ${Math.abs(b)} ${t.from}: ${a}${variable} = ${c - b}`);
  }
  
  let ans = (c - b) / a;
  steps.push(`${t.div} ${a}: ${variable} = ${ans}`);

  return { problem: rawInput, steps: steps, answer: `${variable} = ${ans}` };
}

function errorResult(prob, lang, msg) {
  const defaultMsg = lang === 'ms' ? "Format tidak dikenali. Sila guna: 2x + 5 = 13" : "Format not recognized. Please use: 2x + 5 = 13";
  return { problem: prob, steps: [msg || defaultMsg], answer: "Error" };
}