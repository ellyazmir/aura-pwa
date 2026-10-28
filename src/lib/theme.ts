/**
 * Colour theme chosen by the student. The accent colours of the app are Tailwind's blue/indigo
 * palette; the "purple" theme swaps those variables in src/index.css (see [data-theme='purple']).
 */
export type Theme = 'blue' | 'purple';

const STORAGE_KEY = 'aura.theme';

/** Swatch / browser-bar colour for each theme. */
export const THEME_COLORS: Record<Theme, string> = {
  blue: '#2563eb',
  purple: '#9333ea',
};

export function getTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'purple' ? 'purple' : 'blue';
  } catch {
    return 'blue';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode: the choice just is not remembered
  }
}
