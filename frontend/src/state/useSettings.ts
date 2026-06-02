// Central settings hook: holds Settings in state, reflects them onto the DOM,
// loads them from the Go backend on mount, and persists changes (debounced).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Appearance, DEFAULT_SETTINGS, Dir, LayoutMode, Settings, ThemeChoice, applySettings,
} from './settings';
import { GetSettings, SaveSettings } from '../../wailsjs/go/main/App';
import { main } from '../../wailsjs/go/models';

const SAVE_MS = 400;

export interface SettingsApi {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setTheme: (t: ThemeChoice) => void;
  toggleTheme: () => void;
  setDir: (d: Dir) => void;
  setLayout: (l: LayoutMode) => void;
  setAccent: (hex: string) => void;
  patchAppearance: (patch: Partial<Appearance>) => void;
  patchApi: (patch: Partial<Settings['api']>) => void;
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);
  const saveTimer = useRef<number | null>(null);

  // reflect onto the DOM on every change
  useEffect(() => { applySettings(settings); }, [settings]);

  // load persisted settings from Go on mount
  useEffect(() => {
    GetSettings().then(s => {
      setSettings(s as unknown as Settings);
      loaded.current = true;
    });
  }, []);

  // persist changes (debounced); skip until the initial load lands
  useEffect(() => {
    if (!loaded.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      SaveSettings(main.Settings.createFrom(settings));
    }, SAVE_MS);
  }, [settings]);

  const setTheme = useCallback((theme: ThemeChoice) =>
    setSettings(s => ({ ...s, theme })), []);
  const toggleTheme = useCallback(() =>
    setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' })), []);
  const setDir = useCallback((dir: Dir) =>
    setSettings(s => ({ ...s, dir })), []);
  const setLayout = useCallback((layout: LayoutMode) =>
    setSettings(s => ({ ...s, layout })), []);
  const setAccent = useCallback((accent: string) =>
    setSettings(s => ({ ...s, appearance: { ...s.appearance, accent } })), []);
  const patchAppearance = useCallback((patch: Partial<Appearance>) =>
    setSettings(s => ({ ...s, appearance: { ...s.appearance, ...patch } })), []);
  const patchApi = useCallback((patch: Partial<Settings['api']>) =>
    setSettings(s => ({ ...s, api: { ...s.api, ...patch } })), []);

  return {
    settings, setSettings, setTheme, toggleTheme, setDir, setLayout, setAccent, patchAppearance, patchApi,
  };
}
