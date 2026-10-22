import './style.css'

const input = document.getElementById('cameraInput');
const preview = document.getElementById('preview');

input.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  preview.innerHTML = `
    <p style="color: green;"><strong>✅ Photo captured successfully!</strong></p>
    <p><strong>Name:</strong> ${file.name}</p>
    <p><strong>Size:</strong> ${(file.size / 1024).toFixed(1)} KB</p>
    <img src="${url}" style="max-width: 100%; border-radius: 12px; border: 2px solid #ddd; margin-top: 10px;" />
  `;
});