// Workspace hook: loads the note tree from Go, holds it in state, and exposes
// CRUD + a debounced autosave. The Go side remains the source of truth on disk.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CreateFolder, CreateNote, DeleteFolder, DeleteNote, GetWorkspace, RenameFolder, UpdateNote,
} from '../../wailsjs/go/main/App';
import { main } from '../../wailsjs/go/models';

export type Note = main.Note;
export type Folder = main.Folder;

const AUTOSAVE_MS = 500;

export interface WorkspaceApi {
  folders: Folder[];
  notes: Note[];
  activeId: string | null;
  activeNote: Note | null;
  // id of the most recently created note, so the editor can open it in edit mode
  // (an existing note keeps whatever view the user last chose).
  freshNoteId: string | null;
  saving: boolean;
  loaded: boolean;
  select: (id: string) => void;
  newNote: (folderId?: string) => Promise<void>;
  newFolder: (name?: string) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  setBody: (id: string, body: string) => void;
  flush: () => Promise<void>;
}

export function useWorkspace(): WorkspaceApi {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [freshNoteId, setFreshNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;
  const timer = useRef<number | null>(null);
  const pendingId = useRef<string | null>(null);

  useEffect(() => {
    GetWorkspace().then(ws => {
      setFolders(ws.folders ?? []);
      setNotes(ws.notes ?? []);
      setActiveId((ws.notes ?? [])[0]?.id ?? null);
      setLoaded(true);
    });
  }, []);

  const select = useCallback((id: string) => { setFreshNoteId(null); setActiveId(id); }, []);

  const newNote = useCallback(async (folderId = '') => {
    const n = await CreateNote(folderId, 'Untitled');
    setNotes(prev => [...prev, n]);
    setFreshNoteId(n.id);
    setActiveId(n.id);
  }, []);

  const newFolder = useCallback(async (name = 'New Notebook') => {
    const f = await CreateFolder(name, '');
    setFolders(prev => [...prev, f]);
  }, []);

  const renameNote = useCallback(async (id: string, title: string) => {
    const note = notesRef.current.find(n => n.id === id);
    if (!note) return;
    const u = await UpdateNote(main.Note.createFrom({ ...note, title }));
    setNotes(prev => prev.map(n => (n.id === id ? u : n)));
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    await RenameFolder(id, name);
    setFolders(prev => prev.map(f => (f.id === id ? main.Folder.createFrom({ ...f, name }) : f)));
  }, []);

  const removeNote = useCallback(async (id: string) => {
    await DeleteNote(id);
    const remaining = notesRef.current.filter(n => n.id !== id);
    setNotes(remaining);
    setActiveId(cur => (cur === id ? remaining[0]?.id ?? null : cur));
  }, []);

  const removeFolder = useCallback(async (id: string) => {
    await DeleteFolder(id);
    setFolders(prev => prev.filter(f => f.id !== id));
    setNotes(prev => prev.map(n => (n.folderId === id ? main.Note.createFrom({ ...n, folderId: '' }) : n)));
  }, []);

  const setBody = useCallback((id: string, body: string) => {
    setNotes(prev => prev.map(n => (n.id === id ? main.Note.createFrom({ ...n, body }) : n)));
    setSaving(true);
    pendingId.current = id;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const note = notesRef.current.find(n => n.id === id);
      if (note) {
        const u = await UpdateNote(note);
        setNotes(prev => prev.map(n => (n.id === id ? u : n)));
      }
      setSaving(false);
    }, AUTOSAVE_MS);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const id = pendingId.current;
    if (!id) return;
    const note = notesRef.current.find(n => n.id === id);
    if (note) await UpdateNote(note);
    setSaving(false);
  }, []);

  const activeNote = notes.find(n => n.id === activeId) ?? null;

  return {
    folders, notes, activeId, activeNote, freshNoteId, saving, loaded,
    select, newNote, newFolder, renameNote, renameFolder, removeNote, removeFolder, setBody, flush,
  };
}
