import { useMemo, useState } from 'react';
import { WorkspaceApi } from '../state/useWorkspace';
import { FolderIcon } from './icons';
import { Tooltip } from './Tooltip';

// Three-pane layout: an icon rail of notebooks + a flat note list + the editor.
// Scales to many notes; the editor itself is rendered by the parent.
interface Props {
  api: WorkspaceApi;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function RailList({ api, collapsed, onToggleCollapse }: Props) {
  const { folders, notes, activeId } = api;
  const [sel, setSel] = useState<string>('all'); // 'all' | folderId
  const [query, setQuery] = useState('');

  const topFolders = useMemo(
    () => folders.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  );

  const q = query.trim().toLowerCase();
  const list = useMemo(() => notes.filter(n => {
    if (sel !== 'all' && n.folderId !== sel) return false;
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  }), [notes, sel, q]);

  const snippet = (body: string) =>
    body.replace(/[#>*`_\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64) || 'No additional text';

  return (
    <>
      <aside className="rail">
        <Tooltip tip={collapsed ? 'Show note list' : 'Hide note list'}>
          <button
            className="rail-item"
            aria-label={collapsed ? 'Show note list' : 'Hide note list'}
            onClick={onToggleCollapse}
          >{collapsed ? '»' : '«'}</button>
        </Tooltip>
        <Tooltip tip="New note"><button className="rail-new" aria-label="New note" onClick={() => api.newNote(sel === 'all' ? '' : sel)}>+</button></Tooltip>
        <Tooltip tip="All notes"><button className={`rail-item${sel === 'all' ? ' on' : ''}`} onClick={() => setSel('all')}>◎</button></Tooltip>
        {topFolders.map(f => (
          <Tooltip key={f.id} tip={f.name}>
            <button className={`rail-item${sel === f.id ? ' on' : ''}`} aria-label={f.name} onClick={() => setSel(f.id)}>
              <FolderIcon />
            </button>
          </Tooltip>
        ))}
      </aside>

      {collapsed ? null : (
      <aside className="note-list">
        <div className="search">
          <span className="mag" />
          <input className="search-input" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="nl-scroll">
          {list.length === 0 ? <div className="empty">No notes here</div> : null}
          {list.map(n => (
            <div key={n.id} className={`nl-item${n.id === activeId ? ' active' : ''}`}
            role="button" tabIndex={0} aria-current={n.id === activeId}
            onClick={() => api.select(n.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.select(n.id); } }}>
              <div className="nl-title">{n.title || 'Untitled'}</div>
              <div className="nl-snippet">{snippet(n.body)}</div>
            </div>
          ))}
        </div>
      </aside>
      )}
    </>
  );
}
