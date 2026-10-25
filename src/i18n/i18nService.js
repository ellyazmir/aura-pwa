// src/i18n/i18nService.js
// I18nService — wraps i18next with `ui` and `tutor` namespaces for English and
// Bahasa Malaysia. Persists the selected language under `aura.language`, falls
// back to English for missing keys (logging a console.warn), and emits a change
// event on setLanguage so the UI can re-render without window.location.reload.
//
// Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6

import i18next from 'i18next';

import enUI from './locales/en/ui.json';
import enTutor from './locales/en/tutor.json';
import msUI from './locales/ms/ui.json';
import msTutor from './locales/ms/tutor.json';

/** @typedef {'en'|'ms'} LanguageCode */

/** localStorage key under which the language preference is persisted. */
export const LANGUAGE_STORAGE_KEY = 'aura.language';

/** Supported language codes. */
export const SUPPORTED_LANGUAGES = /** @type {LanguageCode[]} */ (['en', 'ms']);

/** Default/fallback language. */
export const DEFAULT_LANGUAGE = /** @type {LanguageCode} */ ('en');

/** Translation namespaces. */
export const NAMESPACES = ['ui', 'tutor'];

const resources = {
  en: { ui: enUI, tutor: enTutor },
  ms: { ui: msUI, tutor: msTutor },
};

/**
 * Lightweight change-event mechanism. The UI subscribes with onLanguageChanged
 * and re-renders its visible t() strings when the callback fires. This avoids a
 * full page reload on language switch (Property 19).
 *
 * @type {Set<(lang: LanguageCode) => void>}
 */
const listeners = new Set();

let initialised = false;

/**
 * Safely read the persisted language from localStorage.
 * @returns {LanguageCode|undefined}
 */
function readStoredLanguage() {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(/** @type {LanguageCode} */ (stored))) {
      return /** @type {LanguageCode} */ (stored);
    }
  } catch {
    // localStorage may be unavailable (private mode / disabled); fall through.
  }
  return undefined;
}

/**
 * Safely persist the language to localStorage.
 * @param {LanguageCode} lang
 */
function writeStoredLanguage(lang) {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Non-fatal: preference simply won't survive a reload.
  }
}

/**
 * Initialise i18next. Reads any persisted language preference, configures the
 * English fallback, and wires a missing-key handler that logs via console.warn.
 *
 * Safe to call multiple times; subsequent calls resolve immediately.
 *
 * @returns {Promise<void>}
 */
export async function initI18n() {
  if (initialised) return;

  const stored = readStoredLanguage();

  await i18next.init({
    resources,
    lng: stored ?? DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: NAMESPACES,
    defaultNS: 'ui',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      // The UI layer escapes output itself; values here are app-controlled.
      escapeValue: false,
    },
    // Surface missing keys so gaps between language files are caught early.
    saveMissing: true,
    missingKeyHandler: (_lngs, ns, key) => {
      console.warn(`[i18n] Missing translation key: ${ns}:${key}`);
    },
    returnEmptyString: false,
  });

  initialised = true;
}

/**
 * Translate a key. Falls back to English and warns when a key is missing in the
 * active language (Property 18).
 *
 * @param {string} key - key, optionally namespaced as `ns:key`.
 * @param {object} [options] - i18next options (interpolation values, etc.).
 * @returns {string}
 */
export function t(key, options) {
  return i18next.t(key, options);
}

/**
 * Change the active language, persist it, and notify subscribers so the UI can
 * re-render in place (Properties 17 and 19).
 *
 * @param {LanguageCode} lang
 * @returns {Promise<void>}
 */
export async function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    throw new Error(`Unsupported language: ${lang}`);
  }

  if (!initialised) {
    await initI18n();
  }

  await i18next.changeLanguage(lang);
  writeStoredLanguage(lang);

  for (const listener of listeners) {
    try {
      listener(lang);
    } catch (err) {
      // A faulty subscriber must not break language switching for others.
      console.error('[i18n] language-change listener threw', err);
    }
  }
}

/**
 * Return the currently active language.
 * @returns {LanguageCode}
 */
export function getCurrentLanguage() {
  const current = /** @type {LanguageCode} */ (i18next.language);
  return SUPPORTED_LANGUAGES.includes(current) ? current : DEFAULT_LANGUAGE;
}

/**
 * Subscribe to language changes. Returns an unsubscribe function.
 *
 * @param {(lang: LanguageCode) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onLanguageChanged(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
