import { SampleQuestion } from '../types/cikgu';

export const KPM_SUBJECTS = [
  { id: 'Matematik', name: 'Matematik / Mathematics', icon: 'Calculator' },
  { id: 'Matematik Tambahan', name: 'Matematik Tambahan (Add Maths)', icon: 'Sigma' },
  { id: 'Sains', name: 'Sains / Science', icon: 'FlaskConical' },
  { id: 'Fizik', name: 'Fizik / Physics', icon: 'Atom' },
  { id: 'Kimia', name: 'Kimia / Chemistry', icon: 'TestTube' },
  { id: 'Biologi', name: 'Biologi / Biology', icon: 'Dna' },
  { id: 'Sejarah', name: 'Sejarah (SPM & UASA)', icon: 'BookOpen' },
  { id: 'Bahasa Melayu', name: 'Bahasa Melayu (Tatabahasa & Karangan)', icon: 'PenTool' },
  { id: 'English', name: 'English (CEFR KPM SPM)', icon: 'Languages' },
  { id: 'Prinsip Perakaunan', name: 'Prinsip Perakaunan', icon: 'Receipt' },
  { id: 'Ekonomi / Perniagaan', name: 'Ekonomi & Perniagaan', icon: 'TrendingUp' },
];

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
  {
    id: 'spm-addmaths-1',
    level: 'kssm_upper',
    levelName: 'KSSM Tingkatan 4 & 5 (SPM)',
    subject: 'Matematik Tambahan',
    topic: 'Fungsi Kuadratik (Bab 2)',
    question: 'Diberi fungsi kuadratik f(x) = 2x² - 4x + k mempunyai dua punca nyata yang berbeza. Cari julat nilai k. [4 markah]',
    difficulty: 'KBAT Tinggi',
  },
  {
    id: 'spm-fizik-1',
    level: 'kssm_upper',
    levelName: 'KSSM Tingkatan 4 & 5 (SPM)',
    subject: 'Fizik',
    topic: 'Daya dan Gerakan I (Bab 2)',
    question: 'Sebuah kereta berjisim 1200 kg bergerak dengan halaju awal 10 m/s dan memecut secara seragam sehingga mencapai halaju 26 m/s dalam masa 8 saat. Hitungkan daya paduan yang bertindak ke atas kereta tersebut.',
    difficulty: 'Sederhana',
  },
  {
    id: 'spm-kimia-1',
    level: 'kssm_upper',
    levelName: 'KSSM Tingkatan 4 & 5 (SPM)',
    subject: 'Kimia',
    topic: 'Ikatan Kimia (Bab 5)',
    question: 'Terangkan mengapa takat lebur natrium klorida (NaCl) jauh lebih tinggi berbanding takat lebur sebatian kovalen tetraklorometana (CCl4). Nyatakan jenis zarah dan daya tarikan yang terlibat. [4 markah]',
    difficulty: 'KBAT Tinggi',
  },
  {
    id: 'spm-sejarah-1',
    level: 'kssm_upper',
    levelName: 'KSSM Tingkatan 4 & 5 (SPM)',
    subject: 'Sejarah',
    topic: 'Pembentukan Malaysia 1963 (Bab 5 T5)',
    question: 'Jelaskan faktor-faktor yang membawa kepada cadangan pembentukan Persekutuan Malaysia pada tahun 1961 dari aspek keselamatan dan keseimbangan kaum. [6 markah]',
    difficulty: 'KBAT Tinggi',
  },
  {
    id: 'kssm-lower-math-1',
    level: 'kssm_lower',
    levelName: 'KSSM Tingkatan 1–3 (UASA)',
    subject: 'Matematik',
    topic: 'Teorem Pythagoras (Tingkatan 1)',
    question: 'Sebuah tangga dengan panjang 5 meter disandarkan pada dinding tegak. Jika jarak kaki tangga dari dinding ialah 3 meter, hitungkan ketinggian dinding yang dicapai oleh tangga itu.',
    difficulty: 'Sederhana',
  },
  {
    id: 'kssr-math-1',
    level: 'kssr',
    levelName: 'KSSR Tahun 6 (UASA)',
    subject: 'Matematik',
    topic: 'Pecahan & Peratusan',
    question: 'Sebuah kedai buku menerima 500 buah buku rujukan. 2/5 daripada jumlah buku itu ialah buku Matematik dan 30% ialah buku Sains. Berapakah bilangan buku selain Matematik dan Sains?',
    difficulty: 'Sederhana',
  },
  {
    id: 'kssr-sains-1',
    level: 'kssr',
    levelName: 'KSSR Tahun 5 (UASA)',
    subject: 'Sains',
    topic: 'Penyiasatan Saintifik & Tenaga',
    question: 'Sekumpulan murid menjalankan eksperimen untuk mengkaji masa yang diambil oleh ais untuk melebur pada suhu bilik, di bawah kipas, dan di bawah cahaya matahari. Kenal pasti Pemboleh Ubah Dimanipulasikan (PM) dan Pemboleh Ubah Bergerak Balas (PB).',
    difficulty: 'Asas',
  },
];

export const KPM_KBAT_KEYWORDS = [
  {
    kataTugas: 'Nyatakan (State)',
    aras: 'Rendah',
    makna: 'Memberikan jawapan yang spesifik dan tepat tanpa huraian panjang atau langkah kerja rumit.',
  },
  {
    kataTugas: 'Terangkan / Jelaskan (Explain)',
    aras: 'Sederhana / Tinggi',
    makna: 'Memberi sebab, prinsip sains, atau mekanisma kejadian secara logik menggunakan kata hubung "kerana", "oleh itu".',
  },
  {
    kataTugas: 'Wajarkan (Justify)',
    aras: 'KBAT Tinggi',
    makna: 'Memberi alasan kukuh untuk menyokong sesuatu pilihan, keputusan, atau hipotesis dengan fakta sahih.',
  },
  {
    kataTugas: 'Bandingkan (Compare)',
    aras: 'Sederhana',
    makna: 'Menyatakan persamaan dan perbezaan antara dua konsep atau objek.',
  },
  {
    kataTugas: 'Cadangkan (Suggest)',
    aras: 'KBAT Tinggi',
    makna: 'Mengemukakan idea bernas atau penyelesaian alternatif bagi sesuatu masalah situasi dunia sebenar.',
  },
  {
    kataTugas: 'Buktikan / Tunjukkan (Prove/Show)',
    aras: 'Tinggi',
    makna: 'Melakukan langkah kerja matematik tersusun sehingga tiba kepada persamaan atau nilai yang diminta.',
  },
];

export const KPM_FORMULAS = [
  {
    subject: 'Matematik Tambahan (SPM)',
    items: [
      { name: 'Rumus Kuadratik', formula: 'x = [-b ± √(b² - 4ac)] / (2a)' },
      { name: 'Pembezalayan Punca', formula: 'b² - 4ac > 0 (2 punca nyata), = 0 (2 punca sama), < 0 (tiada punca)' },
      { name: 'Titik Tengah', formula: '((x₁ + x₂)/2, (y₁ + y₂)/2)' },
      { name: 'Luas Poligon', formula: '1/2 | (x₁y₂ + x₂y₃ + ...) - (x₂y₁ + x₃y₂ + ...) |' },
      { name: 'Pembezaan (Petua Darab)', formula: 'd/dx(uv) = u(dv/dx) + v(du/dx)' },
      { name: 'Pembezaan (Petua Bahagi)', formula: 'd/dx(u/v) = [v(du/dx) - u(dv/dx)] / v²' },
    ],
  },
  {
    subject: 'Fizik (SPM)',
    items: [
      { name: 'Daya Paduan (Hukum Newton II)', formula: 'F = ma' },
      { name: 'Persamaan Gerakan Linear 1', formula: 'v = u + at' },
      { name: 'Persamaan Gerakan Linear 2', formula: 's = ut + 1/2 at²' },
      { name: 'Persamaan Gerakan Linear 3', formula: 'v² = u² + 2as' },
      { name: 'Tenaga Kinetik', formula: 'E_k = 1/2 mv²' },
      { name: 'Tenaga Keupayaan Graviti', formula: 'E_p = mgh' },
      { name: 'Hukum Ohm', formula: 'V = IR' },
      { name: 'Ketumpatan', formula: 'ρ = m / V' },
    ],
  },
  {
    subject: 'Kimia (SPM)',
    items: [
      { name: 'Bilangan Mol (Jisim)', formula: 'Bilangan mol (n) = Jisim (g) / Jisim Molar (g/mol)' },
      { name: 'Bilangan Mol (Zarah)', formula: 'n = Bilangan zarah / 6.02 × 10²³' },
      { name: 'Kemolaran Larutan', formula: 'M = n / V (dm³) atau M = (1000 × n) / V (cm³)' },
      { name: 'Pencairan Larutan', formula: 'M₁V₁ = M₂V₂' },
    ],
  },
];
