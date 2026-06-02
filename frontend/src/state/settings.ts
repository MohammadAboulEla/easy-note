// EasyNote — app settings (theme, direction, accent, appearance, API config).
// The Go side is the source of truth for persistence (added in M5); until then
// these defaults drive the UI. `applySettings` reflects them onto <html> as the
// data-theme / dir attributes and CSS custom properties the stylesheet reads.

export type ThemeChoice = 'light' | 'dark' | 'system';
export type Dir = 'ltr' | 'rtl';
export type LayoutMode = 'classic' | 'three-pane' | 'focus';
export type FontChoice = 'sans' | 'serif' | 'mono' | 'custom';

export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
  stream: boolean;
  useEnvKey: boolean;
  envVar: string;
}

export interface Appearance {
  accent: string;
  pageBg: string;        // reading-area background tint
  contentWidth: number;  // px
  font: FontChoice;
  customFont: string;    // user-entered system font name (when font === 'custom')
  fontSize: number;      // px
  lineSpacing: number;   // unitless
}

export interface Settings {
  theme: ThemeChoice;
  dir: Dir;
  layout: LayoutMode;
  appearance: Appearance;
  api: ApiConfig;
}

// Default accent swatches surfaced in the top controls & Settings.
export const ACCENTS = ['#5b6cff', '#1f9d6b', '#e0613a', '#a755d4', '#d4a017', '#e5484d'];
// Reading-area background tints — light tints first, then a range of dark tints.
export const PAGE_BGS = [
  // light
  '#fbfbfa', '#f7f1e3', '#eef4ef', '#f3eee7', '#eef1f6',
  // dark
  '#16171a', '#1e2024', '#202530', '#2b2620', '#1a211c', '#1c1a26', '#0f1012',
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',          // per design: default dark
  dir: 'ltr',
  layout: 'classic',
  appearance: {
    accent: '#e0613a',    // per design: default orange
    pageBg: '',           // '' = follow theme (--paper); a hex picks a fixed tint
    contentWidth: 680,
    font: 'sans',
    customFont: '',
    fontSize: 16,
    lineSpacing: 1.7,
  },
  api: {
    provider: 'OpenAI-compatible',
    apiKey: '',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    stream: false,
    useEnvKey: false,
    envVar: 'OPENAI_API_KEY',
  },
};

const FONT_VARS: Record<'sans' | 'serif' | 'mono', string> = {
  sans: 'var(--ui)',
  serif: 'var(--serif)',
  mono: 'var(--mono)',
};

/** Resolve the reading font-family stack, honoring a custom system font name. */
function fontValue(a: Appearance): string {
  if (a.font === 'custom') {
    const name = a.customFont.trim();
    return name ? `"${name}", var(--ui)` : 'var(--ui)';
  }
  return FONT_VARS[a.font];
}

function resolveTheme(theme: ThemeChoice): 'light' | 'dark' {
  if (theme === 'system') {
    const dark = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return dark ? 'dark' : 'light';
  }
  return theme;
}

/** Reflect settings onto the document root so the stylesheet picks them up live. */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(s.theme));
  root.setAttribute('dir', s.dir);
  const { appearance: a } = s;
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--reading-bg', a.pageBg || 'var(--paper)');
  root.style.setProperty('--reading-font', fontValue(a));
  root.style.setProperty('--reading-size', `${a.fontSize}px`);
  root.style.setProperty('--reading-leading', String(a.lineSpacing));
  root.style.setProperty('--reading-width', `${a.contentWidth}px`);
}
