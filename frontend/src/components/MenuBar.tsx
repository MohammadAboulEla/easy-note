import { ReactNode, useEffect, useRef, useState } from 'react';
import { ACCENTS } from '../state/settings';
import { SettingsApi } from '../state/useSettings';

export interface MenuBarProps {
  settingsApi: SettingsApi;
  onNewNote?: () => void;
  onNewFolder?: () => void;
  onSave?: () => void;
  onToggleSidebar?: () => void;
  onSettings?: () => void;
  onAbout?: () => void;
  onInsert?: (kind: InsertKind) => void;
}

export type InsertKind = 'bold' | 'italic' | 'h1' | 'h2' | 'quote' | 'code' | 'link' | 'list';

/* ---- module-level menu primitives (defined outside the component on purpose) ---- */

function Item({ label, accel, onClick, disabled }: {
  label: string; accel?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button className="mi" role="menuitem" disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      {accel ? <span className="accel">{accel}</span> : null}
    </button>
  );
}

function Check({ label, on, onClick }: { label: string; on: boolean; onClick?: () => void }) {
  return (
    <button className="mi" role="menuitemradio" aria-checked={on} onClick={onClick}>
      <span className="tick">{on ? '✓' : ''}</span>
      <span>{label}</span>
    </button>
  );
}

function Sep() { return <div className="msep" />; }
function GroupLabel({ children }: { children: ReactNode }) { return <div className="grp-label">{children}</div>; }

export function MenuBar(props: MenuBarProps) {
  const { settingsApi } = props;
  const { settings, setTheme, setDir, setLayout, setAccent } = settingsApi;
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: string) => setOpen(o => (o === id ? null : id));
  const enter = (id: string) => setOpen(o => (o ? id : o)); // hover-switch only while a menu is open
  const run = (fn?: () => void) => () => { setOpen(null); fn?.(); };
  const insert = (k: InsertKind) => run(() => props.onInsert?.(k));

  const menu = (id: string, label: string, body: ReactNode) => (
    <div className="menu" onMouseEnter={() => enter(id)}>
      <button
        className={`mb${open === id ? ' on' : ''}`}
        aria-haspopup="true"
        aria-expanded={open === id}
        onClick={() => toggle(id)}
      >
        {label}
      </button>
      {open === id ? <div className="menu-pop" role="menu">{body}</div> : null}
    </div>
  );

  return (
    <div className="menubar" ref={barRef}>
      {menu('file', 'File', <>
        <Item label="New Note" accel="Ctrl+N" onClick={run(props.onNewNote)} />
        <Item label="New Folder" onClick={run(props.onNewFolder)} />
        <Sep />
        <Item label="Save" accel="Ctrl+S" onClick={run(props.onSave)} />
        <Sep />
        <Item label="Settings…" accel="Ctrl+," onClick={run(props.onSettings)} />
        <Item label="Quit" accel="Ctrl+Q" onClick={run(() => import('../../wailsjs/runtime/runtime').then(r => r.Quit()))} />
      </>)}

      {menu('edit', 'Edit', <>
        <Item label="Undo" accel="Ctrl+Z" onClick={run(() => document.execCommand('undo'))} />
        <Item label="Redo" accel="Ctrl+Y" onClick={run(() => document.execCommand('redo'))} />
        <Sep />
        <Item label="Cut" accel="Ctrl+X" onClick={run(() => document.execCommand('cut'))} />
        <Item label="Copy" accel="Ctrl+C" onClick={run(() => document.execCommand('copy'))} />
        <Item label="Paste" accel="Ctrl+V" onClick={run(() => document.execCommand('paste'))} />
      </>)}

      {menu('view', 'View', <>
        <GroupLabel>Layout</GroupLabel>
        <Check label="Classic" on={settings.layout === 'classic'} onClick={run(() => setLayout('classic'))} />
        <Check label="Three-pane" on={settings.layout === 'three-pane'} onClick={run(() => setLayout('three-pane'))} />
        <Check label="Focus / Zen" on={settings.layout === 'focus'} onClick={run(() => setLayout('focus'))} />
        <Sep />
        <Item label="Toggle Sidebar" accel="Ctrl+\" onClick={run(props.onToggleSidebar)} />
        <Sep />
        <GroupLabel>Theme</GroupLabel>
        <Check label="Light" on={settings.theme === 'light'} onClick={run(() => setTheme('light'))} />
        <Check label="Dark" on={settings.theme === 'dark'} onClick={run(() => setTheme('dark'))} />
        <Check label="System" on={settings.theme === 'system'} onClick={run(() => setTheme('system'))} />
        <Sep />
        <GroupLabel>Direction</GroupLabel>
        <Check label="Left-to-right" on={settings.dir === 'ltr'} onClick={run(() => setDir('ltr'))} />
        <Check label="Right-to-left" on={settings.dir === 'rtl'} onClick={run(() => setDir('rtl'))} />
        <Sep />
        <GroupLabel>Accent</GroupLabel>
        <div className="swatch-row">
          {ACCENTS.map(hex => (
            <button
              key={hex}
              aria-pressed={settings.appearance.accent === hex}
              aria-label={`Accent ${hex}`}
              style={{ background: hex }}
              onClick={run(() => setAccent(hex))}
            />
          ))}
        </div>
      </>)}

      {menu('insert', 'Insert', <>
        <Item label="Heading 1" onClick={insert('h1')} />
        <Item label="Heading 2" onClick={insert('h2')} />
        <Sep />
        <Item label="Bold" accel="Ctrl+B" onClick={insert('bold')} />
        <Item label="Italic" accel="Ctrl+I" onClick={insert('italic')} />
        <Item label="Quote" onClick={insert('quote')} />
        <Item label="Code" onClick={insert('code')} />
        <Item label="List" onClick={insert('list')} />
        <Item label="Link" accel="Ctrl+K" onClick={insert('link')} />
      </>)}

      {menu('help', 'Help', <>
        <Item label="About EasyNote" onClick={run(props.onAbout)} />
      </>)}
    </div>
  );
}
