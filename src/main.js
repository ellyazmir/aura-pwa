import './style.css';
import { solveEquation, extractTextFromImage } from './solver.js'; 

const homeScreen = document.getElementById('home-screen');
const loadingScreen = document.getElementById('loading-screen');
const reviewScreen = document.getElementById('review-screen');
const resultScreen = document.getElementById('result-screen');
const cameraInput = document.getElementById('cameraInput');
const resultContent = document.getElementById('result-content');
const textInput = document.getElementById('textInput');
const btnSolveText = document.getElementById('btn-solve-text');
const langBtn = document.getElementById('lang-btn');
const themeBtn = document.getElementById('theme-btn');
const ocrTextInput = document.getElementById('ocrTextInput');

let currentLang = 'en';

// --- DARK / LIGHT MODE ---
const htmlEl = document.documentElement;
let isDark = localStorage.getItem('aura-theme') === 'dark';

function applyTheme() {
  if (isDark) {
    htmlEl.setAttribute('data-theme', 'dark');
    themeBtn.innerText = '☀️';
  } else {
    htmlEl.removeAttribute('data-theme');
    themeBtn.innerText = '🌙';
  }
}
applyTheme(); 

themeBtn.addEventListener('click', () => {
  isDark = !isDark;
  localStorage.setItem('aura-theme', isDark ? 'dark' : 'light');
  applyTheme();
});

// --- BAHASA (EN / BM) ---
const translations = {
  en: { title: "Aura", subtitle: "Offline Math Solver", scan: "Scan Problem", orType: "Or type your equation:", solve: "Solve Equation", loading: "Processing offline...", solution: "Solution", scanAgain: "Scan Another", reviewTitle: "Confirm Equation", reviewDesc: "Edit if camera misread:", confirm: "Solve This", cancel: "Retake" },
  ms: { title: "Aura", subtitle: "Penyelesai Matematik Offline", scan: "Imbas Masalah", orType: "Atau taip persamaan anda:", solve: "Selesaikan", loading: "Memproses offline...", solution: "Penyelesaian", scanAgain: "Imbas Lagi", reviewTitle: "Sahkan Persamaan", reviewDesc: "Edit jika kamera tersilap baca:", confirm: "Selesaikan", cancel: "Ambil Semula" }
};

function updateLanguage() {
  const t = translations[currentLang];
  document.getElementById('ui-title').innerText = t.title;
  document.getElementById('ui-subtitle').innerText = t.subtitle;
  document.getElementById('ui-scan').innerText = t.scan;
  document.getElementById('ui-or-type').innerText = t.orType;
  document.getElementById('ui-solve').innerText = t.solve;
  document.getElementById('ui-loading').innerText = t.loading;
  document.getElementById('ui-solution').innerText = t.solution;
  document.getElementById('ui-scan-again').innerText = t.scanAgain;
  document.getElementById('ui-review-title').innerText = t.reviewTitle;
  document.getElementById('ui-review-desc').innerText = t.reviewDesc;
  document.getElementById('ui-confirm').innerText = t.confirm;
  document.getElementById('ui-cancel').innerText = t.cancel;
  langBtn.innerText = currentLang === 'en' ? 'BM' : 'EN';
}

langBtn.addEventListener('click', () => {
  currentLang = currentLang === 'en' ? 'ms' : 'en';
  updateLanguage();
});
updateLanguage();

// --- UI HELPERS ---
function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function displayResult(result) {
  resultContent.innerHTML = `
    <div class="result-box">
      <h3>${result.problem}</h3>
      <ul>${result.steps.map(step => `<li>${step}</li>`).join('')}<li style="font-weight:bold; color:var(--btn-primary-bg); margin-top: 10px;">Answer: ${result.answer}</li></ul>
    </div>
  `;
  showScreen(resultScreen);
}

// --- FUNGSI KECILKAN GAMBAR (Supaya OCR Laju) ---
function resizeImage(file, maxWidth = 800) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          resolve(new File([blob], "resized.jpg", { type: "image/jpeg" }));
        }, 'image/jpeg', 0.8);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- FLOW: CAMERA & OCR SEBENAR ---
document.getElementById('btn-scan').addEventListener('click', () => cameraInput.click());

cameraInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  showScreen(loadingScreen);
  
  try {
    // 1. Kecilkan gambar
    const smallFile = await resizeImage(file, 800); 
    
    // 2. Tesseract baca gambar
    const extractedText = await extractTextFromImage(smallFile);
    
    // 3. Masukkan text ke kotak edit
    ocrTextInput.value = extractedText || "3x - 5 = 7"; // fallback if fail
    showScreen(reviewScreen);
  } catch (err) {
    alert(currentLang === 'ms' ? "Gagal baca gambar. Sila taip manual." : "Failed to read image. Please type manually.");
    showScreen(homeScreen);
  }
  cameraInput.value = ''; 
});

document.getElementById('btn-confirm-ocr').addEventListener('click', async () => {
  const finalEquation = ocrTextInput.value.trim();
  if (!finalEquation) return alert("Please enter an equation.");

  showScreen(loadingScreen);
  try {
    const result = await solveEquation(finalEquation, currentLang);
    displayResult(result);
  } catch (error) {
    alert("Failed to solve.");
    showScreen(homeScreen);
  }
});

document.getElementById('btn-cancel-ocr').addEventListener('click', () => showScreen(homeScreen));

// --- FLOW: TEXT INPUT ---
btnSolveText.addEventListener('click', async () => {
  const equation = textInput.value.trim();
  if (!equation) return alert(currentLang === 'ms' ? "Sila taip persamaan!" : "Please type an equation!");
  
  showScreen(loadingScreen);
  try {
    const result = await solveEquation(equation, currentLang);
    displayResult(result);
  } catch (error) {
    alert("Failed to solve equation.");
    showScreen(homeScreen);
  }
  textInput.value = '';
});

document.getElementById('btn-back').addEventListener('click', () => showScreen(homeScreen));