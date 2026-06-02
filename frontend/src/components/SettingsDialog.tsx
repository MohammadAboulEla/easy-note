import { useEffect, useState } from 'react';
import { ACCENTS, FontChoice, PAGE_BGS, ThemeChoice } from '../state/settings';
import { PROVIDER_PRESETS } from '../state/providers';
import { SettingsApi } from '../state/useSettings';
import { TestConnection } from '../../wailsjs/go/main/App';
import { main } from '../../wailsjs/go/models';

type Tab = 'api' | 'appearance' | 'editor' | 'shortcuts';
type TestState = { status: 'idle' | 'testing' | 'ok' | 'err'; msg: string };

const THEME_PREVIEW: Record<ThemeChoice, React.CSSProperties> = {
  light: { background: '#f4f4f2', boxShadow: 'inset 0 0 0 1.5px #ccc' },
  dark: { background: '#1e2024' },
  system: { background: 'linear-gradient(90deg,#f4f4f2 50%,#1e2024 50%)' },
};

export function SettingsDialog({ api, onClose }: { api: SettingsApi; onClose: () => void }) {
  const { settings, setTheme, setAccent, patchAppearance, patchApi } = api;
  const a = settings.appearance;
  const [tab, setTab] = useState<Tab>('api');
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle', msg: '' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currentPreset =
    PROVIDER_PRESETS.find(p => p.baseURL === settings.api.baseURL.trim().replace(/\/$/, ''))?.id ?? 'custom';

  function applyPreset(id: string) {
    const p = PROVIDER_PRESETS.find(x => x.id === id);
    if (!p) return; // "Custom…" leaves fields as-is
    patchApi({ provider: p.label, baseURL: p.baseURL, model: p.model, envVar: p.envVar });
  }

  async function runTest() {
    setTest({ status: 'testing', msg: '' });
    try {
      const msg = await TestConnection(main.ApiConfig.createFrom(settings.api));
      setTest({ status: 'ok', msg });
    } catch (err: any) {
      setTest({ status: 'err', msg: String(err?.message ?? err) });
    }
  }

  const slider = (
    label: string, value: number, min: number, max: number, step: number,
    onChange: (n: number) => void, fmt: (n: number) => string,
  ) => (
    <div className="field">
      <label>{label}</label>
      <div className="slider-row">
        <input className="range" type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))} />
        <span className="val">{fmt(value)}</span>
      </div>
    </div>
  );

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-head">
          <span className="appicon" style={{ background: 'var(--accent)' }} />
          <h3>Settings</h3>
          <button className="x" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="dlg-nav" role="tablist">
          {(['api', 'appearance', 'editor', 'shortcuts'] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t}
              className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'api' ? 'API' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="dlg-body">
          {tab === 'api' ? (
            <>
              <div className="field">
                <label>Provider preset</label>
                <select className="input select-input" value={currentPreset}
                  onChange={e => applyPreset(e.target.value)}>
                  <option value="custom">Custom…</option>
                  {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <div className="desc">Auto-fills base URL, model &amp; environment variable. Tweak any field below.</div>
              </div>
              <div className="field">
                <label>AI Provider</label>
                <input className="input" value={settings.api.provider}
                  onChange={e => patchApi({ provider: e.target.value })} />
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={settings.api.useEnvKey}
                  onChange={e => patchApi({ useEnvKey: e.target.checked })} />
                <span>
                  <span className="lbl">Use API key from environment or .env file</span>
                  <span className="sub">Keeps the key out of the saved settings file.</span>
                </span>
              </label>

              {settings.api.useEnvKey ? (
                <div className="field">
                  <label>Environment variable</label>
                  <input className="input mono" placeholder="OPENAI_API_KEY"
                    value={settings.api.envVar}
                    onChange={e => patchApi({ envVar: e.target.value })} />
                  <div className="desc">
                    Read from the process environment, or a <code>.env</code> file in the app
                    data folder or working directory.
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>API Key</label>
                  <div className="input-wrap">
                    <input className="input mono" type={showKey ? 'text' : 'password'}
                      placeholder="sk-…" value={settings.api.apiKey}
                      onChange={e => patchApi({ apiKey: e.target.value })} />
                    <button className="reveal" onClick={() => setShowKey(s => !s)}>
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="desc">Stored locally on this device only.</div>
                </div>
              )}
              <div className="field">
                <label>Base URL</label>
                <input className="input mono" value={settings.api.baseURL}
                  onChange={e => patchApi({ baseURL: e.target.value })} />
              </div>
              <div className="field">
                <label>Model</label>
                <input className="input mono" value={settings.api.model}
                  onChange={e => patchApi({ model: e.target.value })} />
              </div>
              <div className="row-between">
                <div>
                  <div className="lbl">Stream responses</div>
                  <div className="sub">Show AI output token-by-token (coming soon)</div>
                </div>
                <button className={`toggle${settings.api.stream ? '' : ' off'}`}
                  aria-pressed={settings.api.stream}
                  onClick={() => patchApi({ stream: !settings.api.stream })} />
              </div>
              {test.status !== 'idle' ? (
                <div className={`test-line ${test.status}`}>
                  {test.status === 'testing' ? 'Testing connection…' : test.msg}
                </div>
              ) : null}
            </>
          ) : null}

          {tab === 'appearance' ? (
            <>
              <div className="fieldset">
                <div className="legend">Theme</div>
                <div className="opt-row">
                  {(['light', 'dark', 'system'] as ThemeChoice[]).map(t => (
                    <div key={t} className={`opt${settings.theme === t ? ' on' : ''}`} onClick={() => setTheme(t)}>
                      <div className="prev" style={THEME_PREVIEW[t]} />
                      {t[0].toUpperCase() + t.slice(1)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Accent color</label>
                <div className="theme-swatches">
                  {ACCENTS.map(hex => (
                    <div key={hex} className={`sw${a.accent === hex ? ' on' : ''}`}
                      style={{ background: hex, color: hex }} onClick={() => setAccent(hex)} />
                  ))}
                </div>
              </div>

              <div className="fieldset">
                <div className="legend">Reading area</div>
                <div className="field">
                  <label>Page background</label>
                  <div className="theme-swatches">
                    <div className={`sw auto${!a.pageBg ? ' on' : ''}`} title="Follow theme"
                      style={{ color: 'var(--accent)' }} onClick={() => patchAppearance({ pageBg: '' })}>A</div>
                    {PAGE_BGS.map(hex => (
                      <div key={hex} className={`sw${a.pageBg === hex ? ' on' : ''}`}
                        style={{ background: hex, color: hex }} onClick={() => patchAppearance({ pageBg: hex })} />
                    ))}
                  </div>
                  <div className="desc">Sepia &amp; soft tints reduce glare for long reading.</div>
                </div>
                {slider('Content width', a.contentWidth, 540, 900, 10,
                  n => patchAppearance({ contentWidth: n }), n => `${n}px`)}
              </div>

              <div className="field">
                <label>Font family</label>
                <div className="opt-row">
                  {([['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono'], ['custom', 'Custom']] as [FontChoice, string][]).map(([f, lbl]) => (
                    <div key={f} className={`opt${a.font === f ? ' on' : ''}`}
                      style={{
                        fontFamily: f === 'serif' ? 'var(--serif)'
                          : f === 'mono' ? 'var(--mono)'
                          : f === 'custom' ? (a.customFont ? `"${a.customFont}", var(--ui)` : 'var(--ui)')
                          : 'var(--ui)',
                      }}
                      onClick={() => patchAppearance({ font: f })}>
                      Aa<br /><span style={{ fontSize: 10 }}>{lbl}</span>
                    </div>
                  ))}
                </div>
                {a.font === 'custom' ? (
                  <>
                    <input className="input" placeholder="Cascadia Code" value={a.customFont}
                      onChange={e => patchAppearance({ customFont: e.target.value })} />
                    <div className="desc">Type any font installed on your system.</div>
                  </>
                ) : null}
              </div>

              {slider('Font size', a.fontSize, 12, 22, 1, n => patchAppearance({ fontSize: n }), n => `${n}px`)}
              {slider('Line spacing', a.lineSpacing, 1.3, 2.2, 0.1,
                n => patchAppearance({ lineSpacing: Math.round(n * 10) / 10 }), n => n.toFixed(1))}
            </>
          ) : null}

          {tab === 'editor' ? (
            <div className="placeholder-tab">Editor preferences are coming soon.</div>
          ) : null}
          {tab === 'shortcuts' ? (
            <div className="placeholder-tab">
              <div className="kv"><span>New note</span><kbd>Ctrl+N</kbd></div>
              <div className="kv"><span>Save</span><kbd>Ctrl+S</kbd></div>
              <div className="kv"><span>Toggle sidebar</span><kbd>Ctrl+\</kbd></div>
              <div className="kv"><span>Bold / Italic / Link</span><kbd>Ctrl+B / I / K</kbd></div>
            </div>
          ) : null}
        </div>

        <div className="dlg-foot">
          {tab === 'api'
            ? <button className="ghost" disabled={test.status === 'testing'} onClick={runTest}>Test connection</button>
            : <span />}
          <button className="solid" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
