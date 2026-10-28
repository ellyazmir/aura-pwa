/**
 * Decide which language Cikgu AI should answer in. The header no longer has a language picker,
 * so the app looks at what the student actually wrote.
 */
export type ReplyLanguage = 'bm' | 'en';

const EN_WORDS =
  /\b(the|is|are|was|were|am|be|what|which|how|why|when|where|who|can|could|would|should|do|does|did|you|your|me|my|i|we|help|please|find|solve|write|choose|explain|give|show|calculate|answer|step|steps|hint|equation|value|and|of|to|in|that|with|from|this|word|sentence|correct)\b/gi;
const BM_WORDS =
  /\b(yang|dan|ialah|adalah|apakah|apa|bagaimana|macam|mana|cara|mengapa|kenapa|cari|hitung|hitungkan|terangkan|jelaskan|nyatakan|diberi|dengan|untuk|dalam|pada|ini|itu|bagi|jika|nilai|tentukan|berapakah|tolong|bantu|boleh|bolehkah|saya|tunjuk|tunjukkan|soalan|jawapan|selesaikan|persamaan|cikgu)\b/gi;

function score(text: string): { en: number; bm: number } {
  return {
    en: (text.match(EN_WORDS) || []).length,
    bm: (text.match(BM_WORDS) || []).length,
  };
}

/** Language of one piece of text, or null when it has no clear signal (e.g. just "3a + 5 = 8"). */
export function detectTextLanguage(text: string): ReplyLanguage | null {
  const { en, bm } = score(text);
  if (en === bm) return null;
  return en > bm ? 'en' : 'bm';
}

/** Same as detectTextLanguage, but defaults to Bahasa Melayu when there is no signal. */
export function detectLanguage(text: string): ReplyLanguage {
  return detectTextLanguage(text) ?? 'bm';
}

/**
 * Language of the conversation: look at the student's messages from newest to oldest and use the
 * first one with a clear signal. The "Pilihan saya:" label added to clicked options is ignored,
 * so picking an option in an English chat does not switch the reply to Malay.
 */
export function detectConversationLanguage(
  messages: { role: string; content: string }[],
): ReplyLanguage {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const text = String(m.content ?? '').replace(/^\s*(?:Pilihan saya|My choice):\s*[A-C]\.\s*/i, '');
    const lang = detectTextLanguage(text);
    if (lang) return lang;
  }
  return 'bm';
}
