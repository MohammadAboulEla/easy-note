import { useEffect, useRef, useState } from 'react';
import { useSettings } from './state/useSettings';
import { useWorkspace } from './state/useWorkspace';
import { TitleBar } from './components/TitleBar';
import { MenuBar } from './components/MenuBar';
import { StatusBar, EditorStats } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { RailList } from './components/RailList';
import { Editor, EditorHandle } from './components/Editor';
import { SettingsDialog } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { GuideDialog } from './components/GuideDialog';

const ZERO_STATS: EditorStats = { words: 0, ln: 1, col: 1 };

// M6 — three switchable layouts (Classic / Three-pane / Focus) + About dialog.
function App() {
  const settingsApi = useSettings();
  const { settings } = settingsApi;
  const ws = useWorkspace();
  const editorRef = useRef<EditorHandle>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [modal, setModal] = useState<'settings' | 'about' | 'guide' | 'needFolder' | null>(null);
  const [stats, setStats] = useState<EditorStats>(ZERO_STATS);

  // Obsidian-style: a note always lives in a real folder, so it has a known
  // location on disk. If no folder exists yet, prompt the user to create/open
  // one instead of silently creating an in-app (workspace.json) note. A folderId
  // is passed straight through (the "+" on an existing folder).
  const newNote = (folderId?: string) => {
    // No real folder targeted (undefined or "" = Unfiled) and none exist yet →
    // prompt to create/open one rather than make an invisible workspace.json note.
    if (!folderId && ws.folders.length === 0) {
      setModal('needFolder');
      return;
    }
    ws.newNote(folderId);
  };
  // The sidebars create notes via api.newNote; route them through the guard too.
  const guardedWs = { ...ws, newNote: async (folderId?: string) => { newNote(folderId); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') { e.preventDefault(); ws.flush(); }
      else if (e.key === 'n') { e.preventDefault(); newNote(); }
      else if (e.key === 'o') { e.preventDefault(); ws.openFile(); }
      else if (e.key === '\\') { e.preventDefault(); setSidebarCollapsed(c => !c); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ws]);

  const active = ws.activeNote;
  const layout = settings.layout;
  const focusMode = layout === 'focus';
  const mode = focusMode ? 'Focus mode' : 'Markdown';

  const editorPane = active ? (
    <Editor
      ref={editorRef}
      noteId={active.id}
      isNew={ws.freshNoteId === active.id}
      body={active.body}
      onChange={b => ws.setBody(active.id, b)}
      onStats={setStats}
      focus={focusMode}
      behavior={settings.ai}
    />
  ) : (
    <div className="editor">
      <div className="editor-empty">
        {!ws.loaded ? 'Loading…'
          : ws.folders.length === 0
            ? 'No folder yet. Create or open a folder to start adding notes.'
            : 'No note selected. Create one with “New Note”.'}
      </div>
    </div>
  );

  return (
    <div className={`app${focusMode ? ' focus' : ''}`}>
      <TitleBar title={active ? `EasyNote — ${active.title}.md` : 'EasyNote'} />

      {focusMode ? null : (
        <MenuBar
          settingsApi={settingsApi}
          onNewNote={() => newNote()}
          onNewFolder={() => ws.newFolder()}
          onOpenFolder={() => ws.openFolder()}
          onOpenFile={() => ws.openFile()}
          onSave={() => ws.flush()}
          onToggleSidebar={() => setSidebarCollapsed(c => !c)}
          onSettings={() => setModal('settings')}
          onAbout={() => setModal('about')}
          onGuide={() => setModal('guide')}
          onInsert={k => editorRef.current?.format(k)}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
        />
      )}

      <div className="app-body">
        {focusMode ? (
          <>
            <button className="focus-exit" onClick={() => settingsApi.setLayout('classic')}>‹ Exit focus</button>
            {editorPane}
          </>
        ) : layout === 'three-pane' ? (
          <>
            <RailList
              api={guardedWs}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            />
            {editorPane}
          </>
        ) : (
          <>
            <Sidebar
              api={guardedWs}
              collapsed={sidebarCollapsed}
              onExpand={() => setSidebarCollapsed(false)}
              onCollapse={() => setSidebarCollapsed(true)}
            />
            {editorPane}
          </>
        )}
      </div>

      <StatusBar mode={mode} stats={active ? stats : ZERO_STATS} dir={settings.dir} saved={!ws.saving} />

      {modal === 'settings' ? <SettingsDialog api={settingsApi} onClose={() => setModal(null)} /> : null}
      {modal === 'about' ? <AboutDialog onClose={() => setModal(null)} /> : null}
      {modal === 'guide' ? <GuideDialog onClose={() => setModal(null)} /> : null}
      {modal === 'needFolder' ? (
        <div className="modal-scrim" onMouseDown={() => setModal(null)}>
          <div className="dlg confirm-dlg" role="dialog" aria-modal="true" aria-label="Create a folder first"
            onMouseDown={e => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>Create a folder first</h3>
              <button className="x" aria-label="Close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="confirm-body">
              <p>EasyNote keeps every note as a real <code>.md</code> file inside a folder on
                your disk, so you always know where it lives. Create a new folder or open an
                existing one, then add your note there.</p>
            </div>
            <div className="dlg-foot">
              <button className="ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="ghost" onClick={() => { setModal(null); ws.openFolder(); }}>Open Folder…</button>
              <button className="solid" autoFocus onClick={() => { setModal(null); ws.newFolder(); }}>New Folder</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
