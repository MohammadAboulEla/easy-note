import { useMemo, useState } from 'react';
import { Folder, Note, WorkspaceApi } from '../state/useWorkspace';
import { FolderIcon } from './icons';

interface Props {
  api: WorkspaceApi;
  collapsed: boolean;
  onExpand: () => void;
}

type Editing = { kind: 'note' | 'folder'; id: string } | null;

export function Sidebar({ api, collapsed, onExpand }: Props) {
  const { folders, notes, activeId } = api;
  const [query, setQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);

  const topFolders = useMemo(
    () => folders.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  );
  const unfiled = useMemo(() => notes.filter(n => !n.folderId), [notes]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [q, notes]);

  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <button className="collapse-toggle" aria-label="Expand sidebar" onClick={onExpand}>☰</button>
        <button className="rail-new" aria-label="New note" onClick={() => api.newNote()}>+</button>
        {topFolders.map(f => <span key={f.id} className="rail-folder" title={f.name}><FolderIcon /></span>)}
      </aside>
    );
  }

  const toggleFolder = (id: string) =>
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const commitRename = (value: string) => {
    if (!editing) return;
    const name = value.trim();
    if (name) {
      if (editing.kind === 'note') api.renameNote(editing.id, name);
      else api.renameFolder(editing.id, name);
    }
    setEditing(null);
  };

  const renameInput = (initial: string) => (
    <input
      className="rename-input"
      autoFocus
      defaultValue={initial}
      onBlur={e => commitRename(e.currentTarget.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') commitRename(e.currentTarget.value);
        else if (e.key === 'Escape') setEditing(null);
      }}
      onClick={e => e.stopPropagation()}
    />
  );

  const noteRow = (n: Note, flat = false) => (
    <div
      key={n.id}
      className={`note-item${n.id === activeId ? ' active' : ''}${flat ? ' flat' : ''}`}
      role="button"
      tabIndex={0}
      aria-current={n.id === activeId}
      onClick={() => api.select(n.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.select(n.id); } }}
      onDoubleClick={() => setEditing({ kind: 'note', id: n.id })}
      title={n.title}
    >
      {editing?.kind === 'note' && editing.id === n.id
        ? renameInput(n.title)
        : <span className="row-label">{n.title || 'Untitled'}</span>}
      <button
        className="row-del"
        aria-label={`Delete ${n.title}`}
        onClick={e => { e.stopPropagation(); api.removeNote(n.id); }}
      >✕</button>
    </div>
  );

  const folderBlock = (f: Folder) => {
    const open = !collapsedFolders.has(f.id);
    const kids = notes.filter(n => n.folderId === f.id);
    return (
      <div key={f.id}>
        <div className="folder" onClick={() => toggleFolder(f.id)}
          onDoubleClick={() => setEditing({ kind: 'folder', id: f.id })}>
          <span className="tri">{open ? '▾' : '▸'}</span>
          <FolderIcon />
          {editing?.kind === 'folder' && editing.id === f.id
            ? renameInput(f.name)
            : <span className="row-label">{f.name}</span>}
          <button className="row-add" aria-label={`New note in ${f.name}`}
            onClick={e => { e.stopPropagation(); api.newNote(f.id); }}>+</button>
          <button className="row-del" aria-label={`Delete ${f.name}`}
            onClick={e => { e.stopPropagation(); api.removeFolder(f.id); }}>✕</button>
        </div>
        {open ? kids.map(n => noteRow(n)) : null}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <button className="btn-new no-drag" onClick={() => api.newNote()}>
        <span className="plus">+</span> New Note
      </button>
      <div className="search">
        <span className="mag" />
        <input
          className="search-input"
          placeholder="Search notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="tree">
        {matches ? (
          <>
            <div className="sec">{matches.length} result{matches.length === 1 ? '' : 's'}</div>
            {matches.map(n => noteRow(n, true))}
            {matches.length === 0 ? <div className="empty">No matching notes</div> : null}
          </>
        ) : (
          <>
            <div className="sec">
              Notebooks
              <button className="sec-add" aria-label="New notebook" onClick={() => api.newFolder()}>+</button>
            </div>
            {topFolders.map(folderBlock)}
            {unfiled.length > 0 ? (
              <>
                <div className="sec">Unfiled</div>
                {unfiled.map(n => noteRow(n, true))}
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
