import React, { useMemo, useState } from 'react';
import { Folder, Note, WorkspaceApi } from '../state/useWorkspace';
import { FolderIcon } from './icons';
import { ConfirmDialog } from './ConfirmDialog';
import { Tooltip } from './Tooltip';

// Pending deletion awaiting confirmation.
type Pending =
  | { kind: 'note'; id: string; name: string; linked?: boolean }
  | { kind: 'folder'; id: string; name: string; linked?: boolean }
  | null;

const isLinked = (id: string) => id.startsWith('linked:');

interface Props {
  api: WorkspaceApi;
  collapsed: boolean;
  onExpand: () => void;
  onCollapse?: () => void;
}

type Editing = { kind: 'note' | 'folder'; id: string } | null;

export function Sidebar({ api, collapsed, onExpand, onCollapse }: Props) {
  const { folders, notes, activeId } = api;
  const [query, setQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [pendingDelete, setPendingDelete] = useState<Pending>(null);
  // Drag-and-drop: the note being dragged, and the folder id currently hovered
  // as a drop target ('' = Unfiled, 'linked:<dir>' = a linked folder).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const onDrop = (target: string) => {
    if (dragId) api.moveNote(dragId, target);
    setDragId(null);
    setDropTarget(null);
  };
  // dt is the drop-target id for this folder/section ('' for Unfiled).
  const dropProps = (dt: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== dt) setDropTarget(dt);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Only clear when leaving the element itself, not a child.
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropTarget(t => (t === dt ? null : t));
      }
    },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); onDrop(dt); },
  });

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'folder') {
      // removeFolder already unlinks a linked folder (files left on disk).
      api.removeFolder(pendingDelete.id);
    } else if (pendingDelete.linked) {
      // A standalone linked file is removed from the app, not deleted on disk.
      api.closeLink(pendingDelete.id);
    } else {
      api.removeNote(pendingDelete.id);
    }
    setPendingDelete(null);
  };

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
        <Tooltip tip="Expand sidebar"><button className="collapse-toggle" aria-label="Expand sidebar" onClick={onExpand}>☰</button></Tooltip>
        <Tooltip tip="New note"><button className="rail-new" aria-label="New note" onClick={() => api.newNote()}>+</button></Tooltip>
        {topFolders.map(f => <Tooltip key={f.id} tip={f.name}><span className="rail-folder"><FolderIcon /></span></Tooltip>)}
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
      className={`note-item${n.id === activeId ? ' active' : ''}${flat ? ' flat' : ''}${n.id === dragId ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      draggable={editing?.id !== n.id}
      aria-current={n.id === activeId}
      onDragStart={e => { setDragId(n.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
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
        onClick={e => { e.stopPropagation(); setPendingDelete({ kind: 'note', id: n.id, name: n.title || 'Untitled', linked: n.linked && !n.folderId }); }}
      >✕</button>
    </div>
  );

  const folderBlock = (f: Folder) => {
    const open = !collapsedFolders.has(f.id);
    const kids = notes.filter(n => n.folderId === f.id);
    return (
      <div key={f.id}>
        <div className={`folder${dropTarget === f.id ? ' drop-target' : ''}`}
          onClick={() => toggleFolder(f.id)}
          {...dropProps(f.id)}
          onDoubleClick={() => { if (!f.linked) setEditing({ kind: 'folder', id: f.id }); }}>
          <span className="tri">{open ? '▾' : '▸'}</span>
          <Tooltip tip={f.linked ? f.path : undefined}><span className="folder-ic-wrap"><FolderIcon /></span></Tooltip>
          {editing?.kind === 'folder' && editing.id === f.id
            ? renameInput(f.name)
            : <span className="row-label">{f.name}</span>}
          <button className="row-add" aria-label={`New note in ${f.name}`}
            onClick={e => { e.stopPropagation(); api.newNote(f.id); }}>+</button>
          <button className="row-del" aria-label={f.linked ? `Close ${f.name}` : `Delete ${f.name}`}
            onClick={e => { e.stopPropagation(); setPendingDelete({ kind: 'folder', id: f.id, name: f.name, linked: f.linked }); }}>✕</button>
        </div>
        {open ? kids.map(n => noteRow(n)) : null}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sb-head">
        <button className="btn-new no-drag" onClick={() => api.newNote()}>
          <span className="plus">+</span> New Note
        </button>
        {onCollapse ? (
          <Tooltip tip="Collapse sidebar"><button className="collapse-toggle" aria-label="Collapse sidebar" onClick={onCollapse}>«</button></Tooltip>
        ) : null}
      </div>
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
            {(unfiled.length > 0 || dragId) ? (
              <div className={dropTarget === '' && dragId ? 'drop-target' : undefined} {...dropProps('')}>
                <div className="sec">Unfiled</div>
                {unfiled.map(n => noteRow(n, true))}
                {unfiled.length === 0 ? <div className="empty">Drop here to unfile</div> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {pendingDelete ? (
        <ConfirmDialog
          title={
            pendingDelete.linked
              ? (pendingDelete.kind === 'folder' ? 'Close folder' : 'Close file')
              : (pendingDelete.kind === 'note' ? 'Delete note' : 'Delete notebook')
          }
          message={
            pendingDelete.linked
              ? `Remove “${pendingDelete.name}” from EasyNote? The files stay on disk in their original location.`
              : pendingDelete.kind === 'note'
                ? `Delete “${pendingDelete.name}”? This can’t be undone.`
                : `Delete the notebook “${pendingDelete.name}”? Its notes will be moved to Unfiled. This can’t be undone.`
          }
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </aside>
  );
}
