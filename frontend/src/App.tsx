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
  const [modal, setModal] = useState<'settings' | 'about' | 'guide' | null>(null);
  const [stats, setStats] = useState<EditorStats>(ZERO_STATS);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') { e.preventDefault(); ws.flush(); }
      else if (e.key === 'n') { e.preventDefault(); ws.newNote(); }
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
        {ws.loaded ? 'No note selected. Create one with “New Note”.' : 'Loading…'}
      </div>
    </div>
  );

  return (
    <div className="app">
      <TitleBar title={active ? `EasyNote — ${active.title}.md` : 'EasyNote'} />

      {focusMode ? null : (
        <MenuBar
          settingsApi={settingsApi}
          onNewNote={() => ws.newNote()}
          onNewFolder={() => ws.newFolder()}
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
              api={ws}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            />
            {editorPane}
          </>
        ) : (
          <>
            <Sidebar
              api={ws}
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
    </div>
  );
}

export default App;
