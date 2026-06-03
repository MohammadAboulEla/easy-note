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
  inkColor: string;      // reading-area text color ('' = follow theme --ink)
  aiBubbleBg: string;    // AI quick-action bubble bg ('' = follow theme default)
  contentWidth: number;  // px
  font: FontChoice;
  customFont: string;    // user-entered system font name (when font === 'custom')
  fontSize: number;      // px
  lineSpacing: number;   // unitless
}

export interface AiCommand { id: string; label: string; instruction: string }

export interface AiBehavior {
  systemPrompt: string;      // persona / global instruction prepended to every tweak
  tone: string;              // neutral | professional | friendly | academic | custom
  language: string;          // '' = match source, or 'English', 'Arabic', …
  verbosity: string;         // concise | balanced | detailed
  temperature: number;       // 0–1 creativity
  preserveMarkdown: boolean; // keep markdown structure of the selection
  commands: AiCommand[];     // custom reusable actions → overlay chips
}

export interface Settings {
  theme: ThemeChoice;
  dir: Dir;
  layout: LayoutMode;
  appearance: Appearance;
  api: ApiConfig;
  ai: AiBehavior;
}

// Seed commands mirror today's hardcoded overlay chips so behavior is unchanged
// out of the box. `instruction` maps to the backend preset action where one
// exists, else a free-text prompt.
export const DEFAULT_AI_BEHAVIOR: AiBehavior = {
  systemPrompt: '',
  tone: 'neutral',
  language: '',
  verbosity: 'balanced',
  temperature: 0.4,
  preserveMarkdown: true,
  commands: [
    { id: 'improve', label: 'Improve writing', instruction: 'improve' },
    { id: 'summarize', label: 'Summarize', instruction: 'summarize' },
    { id: 'formal', label: 'Make formal', instruction: 'formal' },
    { id: 'translate', label: 'Translate', instruction: 'Translate this text to English.' },
    { id: 'grammar', label: 'Fix grammar', instruction: 'grammar' },
  ],
};

// Default accent swatches surfaced in the top controls & Settings. The palette
// walks the hue wheel in even steps so no two swatches read as duplicates —
// one distinct color per common modern-app accent family.
export const ACCENTS = [
  '#e5484d', // red
  '#f97316', // orange
  '#e0613a', // terracotta (default)
  '#d4a017', // amber/gold
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#1f9d6b', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#5b6cff', // indigo
  '#7c3aed', // violet
  '#a755d4', // purple
  '#d946ef', // magenta
  '#ec4899', // pink
  '#f43f5e', // rose
  '#78716c', // warm grey
  '#64748b', // slate
];
// Reading-area background tints — comfortable page colors from reading apps
// (paper white, sepia, cream, mint, cool grey), then a range of dark tints.
export const PAGE_BGS = [
  // light — paper-white omitted: the "A" (follow-theme) default already gives it
  '#f7f1e3', // sepia (Kindle/iBooks)
  '#faf3e0', // warm cream
  '#eef4ef', // soft mint
  '#eef1f6', // cool grey
  // dark
  '#16171a', // near-black
  '#1e2024', // charcoal
  '#202530', // blue-charcoal
  '#22201b', // warm dark (sepia night)
  '#2b2620', // espresso
];
// Reading-area ink (text) tints and AI bubble backgrounds reuse the same palette
// as the page backgrounds so all three reading-area swatch rows line up
// identically. (As ink, a tint colors the text; as a bubble bg, text contrast is
// derived automatically — see applySettings.)
export const INK_COLORS = PAGE_BGS;
export const AI_BUBBLE_BGS = PAGE_BGS;

/** True if a hex color is light enough to want dark text on top of it. */
function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Rec. 601 luma.
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',          // per design: default dark
  dir: 'ltr',
  layout: 'classic',
  appearance: {
    accent: '#e0613a',    // per design: default orange
    pageBg: '',           // '' = follow theme (--paper); a hex picks a fixed tint
    inkColor: '',         // '' = follow theme (--ink); a hex picks a fixed text color
    aiBubbleBg: '',       // '' = follow theme default; a hex picks a fixed bubble bg
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
  ai: DEFAULT_AI_BEHAVIOR,
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
  root.style.setProperty('--reading-ink', a.inkColor || 'var(--ink)');
  if (a.aiBubbleBg) {
    root.style.setProperty('--ai-bubble-bg', a.aiBubbleBg);
    root.style.setProperty('--ai-bubble-ink', isLightHex(a.aiBubbleBg) ? '#1b1c1f' : '#f4f4f2');
  } else {
    // Fall back to the theme default tokens defined in theme.css.
    root.style.removeProperty('--ai-bubble-bg');
    root.style.removeProperty('--ai-bubble-ink');
  }
  root.style.setProperty('--reading-font', fontValue(a));
  root.style.setProperty('--reading-size', `${a.fontSize}px`);
  root.style.setProperty('--reading-leading', String(a.lineSpacing));
  root.style.setProperty('--reading-width', `${a.contentWidth}px`);
}
