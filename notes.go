package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// Folder is a notebook. Nesting is intentionally shallow (ParentID supported but
// the UI keeps one level by default).
type Folder struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId"`
	// Linked is true for folders backed by a real directory on disk (added via
	// File → Open Folder). Path is that directory's absolute path. Linked folders
	// are not persisted in workspace.json; they are rebuilt from links.json each run.
	Linked bool   `json:"linked,omitempty"`
	Path   string `json:"path,omitempty"`
}

// Note is a single markdown document. Body holds raw markdown.
type Note struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	FolderID  string `json:"folderId"` // "" = uncategorized
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	// Linked is true for notes backed by a real .md file on disk. Path is that
	// file's absolute path. Linked notes live in their original location and are
	// read/written in place; they are never stored in workspace.json.
	Linked bool   `json:"linked,omitempty"`
	Path   string `json:"path,omitempty"`
}

// Workspace is the full persisted note tree.
type Workspace struct {
	Folders []Folder `json:"folders"`
	Notes   []Note   `json:"notes"`
}

func now() int64 { return time.Now().UnixMilli() }

// appDataDir returns (and ensures) the per-user data directory for EasyNote.
func appDataDir() string {
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		base, _ = os.UserHomeDir()
	}
	dir := filepath.Join(base, "EasyNote")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func (a *App) workspacePath() string { return filepath.Join(a.dataDir, "workspace.json") }

// loadWorkspace reads the workspace from disk, seeding a starter tree on first run.
func (a *App) loadWorkspace() {
	data, err := os.ReadFile(a.workspacePath())
	if err != nil {
		a.ws = seedWorkspace()
		a.persistWorkspace()
		return
	}
	var ws Workspace
	if err := json.Unmarshal(data, &ws); err != nil {
		a.ws = seedWorkspace()
		return
	}
	a.ws = ws
}

// persistWorkspace writes the workspace to disk. Callers hold a.mu.
func (a *App) persistWorkspace() {
	data, err := json.MarshalIndent(a.ws, "", "  ")
	if err != nil {
		return
	}
	tmp := a.workspacePath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, a.workspacePath())
}

// seedWorkspace returns an empty workspace. First-run sample content is no longer
// seeded as embedded JSON notes — it is created as real .md files in an on-disk
// vault (see seedVault in files.go), so every note has a known file location.
func seedWorkspace() Workspace {
	return Workspace{}
}

// ---- Bound CRUD API (exposed to the frontend) ----

// GetWorkspace returns the full note tree: embedded notes/folders from
// workspace.json merged with the live contents of any linked folders/files.
func (a *App) GetWorkspace() Workspace {
	a.mu.Lock()
	defer a.mu.Unlock()
	lf, ln := a.scanLinks()
	return Workspace{
		Folders: append(append([]Folder{}, a.ws.Folders...), lf...),
		Notes:   append(append([]Note{}, a.ws.Notes...), ln...),
	}
}

// CreateNote creates an empty note in the given folder ("" = uncategorized).
func (a *App) CreateNote(folderID string, title string) (Note, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if title == "" {
		title = "Untitled"
	}
	// A folderID of "linked:<dir>" means create a real .md file in that directory.
	if dir, ok := linkedFolderDir(folderID); ok {
		return a.createLinkedNote(dir, title)
	}
	t := now()
	n := Note{ID: uuid.NewString(), Title: title, FolderID: folderID, Body: "", CreatedAt: t, UpdatedAt: t}
	a.ws.Notes = append(a.ws.Notes, n)
	a.persistWorkspace()
	return n, nil
}

// UpdateNote replaces title/body/folder of an existing note and stamps UpdatedAt.
// For linked notes the body is written back to the original .md file in place.
func (a *App) UpdateNote(in Note) (Note, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if in.Linked {
		return a.writeLinkedNote(in)
	}
	for i := range a.ws.Notes {
		if a.ws.Notes[i].ID == in.ID {
			a.ws.Notes[i].Title = in.Title
			a.ws.Notes[i].Body = in.Body
			a.ws.Notes[i].FolderID = in.FolderID
			a.ws.Notes[i].UpdatedAt = now()
			a.persistWorkspace()
			return a.ws.Notes[i], nil
		}
	}
	return Note{}, errors.New("note not found")
}

// MoveNote moves a note into a different folder. The targetFolderID is either an
// embedded folder id, "" for Unfiled, or a "linked:<dir>" id for a real folder on
// disk. The four combinations of embedded/linked source and target are handled:
//
//   - embedded → embedded/unfiled: just rewrite the note's FolderID.
//   - embedded → linked: create a real .md file in the target dir, drop the JSON note.
//   - linked   → linked: move the file on disk into the target dir.
//   - linked   → embedded/unfiled: read the file into an embedded note, drop the
//     on-disk index entry is NOT done (the file stays); the embedded copy wins.
//
// Returns the moved note in its new form so the frontend can reconcile ids.
func (a *App) MoveNote(noteID, targetFolderID string) (Note, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	srcPath, srcLinked := linkedNotePath(noteID)
	dstDir, dstLinked := linkedFolderDir(targetFolderID)

	switch {
	case srcLinked && dstLinked:
		return a.moveLinkedFile(srcPath, dstDir)

	case srcLinked && !dstLinked:
		// Linked file → embedded note: read it in, leave the file on disk.
		n, err := readNoteFile(srcPath, "")
		if err != nil {
			return Note{}, err
		}
		n.ID = uuid.NewString()
		n.Linked = false
		n.Path = ""
		n.FolderID = targetFolderID
		a.ws.Notes = append(a.ws.Notes, n)
		a.persistWorkspace()
		return n, nil

	case !srcLinked && dstLinked:
		// Embedded note → linked folder: write a real file, drop the JSON note.
		var moved *Note
		for i := range a.ws.Notes {
			if a.ws.Notes[i].ID == noteID {
				moved = &a.ws.Notes[i]
				break
			}
		}
		if moved == nil {
			return Note{}, errors.New("note not found")
		}
		n, err := a.createLinkedNote(dstDir, moved.Title)
		if err != nil {
			return Note{}, err
		}
		n.Body = moved.Body
		if _, err := a.writeLinkedNote(n); err != nil {
			return Note{}, err
		}
		a.removeEmbedded(noteID)
		a.persistWorkspace()
		return n, nil

	default:
		// Embedded → embedded/unfiled.
		for i := range a.ws.Notes {
			if a.ws.Notes[i].ID == noteID {
				a.ws.Notes[i].FolderID = targetFolderID
				a.ws.Notes[i].UpdatedAt = now()
				a.persistWorkspace()
				return a.ws.Notes[i], nil
			}
		}
		return Note{}, errors.New("note not found")
	}
}

// removeEmbedded drops an embedded note by id. Callers hold a.mu.
func (a *App) removeEmbedded(id string) {
	out := a.ws.Notes[:0]
	for _, n := range a.ws.Notes {
		if n.ID != id {
			out = append(out, n)
		}
	}
	a.ws.Notes = out
}

// DeleteNote removes a note by id.
func (a *App) DeleteNote(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	// Linked notes carry a "linked:<path>" id; deleting removes the file on disk.
	if path, ok := linkedNotePath(id); ok {
		return os.Remove(path)
	}
	out := a.ws.Notes[:0]
	found := false
	for _, n := range a.ws.Notes {
		if n.ID == id {
			found = true
			continue
		}
		out = append(out, n)
	}
	if !found {
		return errors.New("note not found")
	}
	a.ws.Notes = out
	a.persistWorkspace()
	return nil
}

// CreateFolder adds a notebook.
func (a *App) CreateFolder(name string, parentID string) (Folder, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if name == "" {
		name = "New Notebook"
	}
	f := Folder{ID: uuid.NewString(), Name: name, ParentID: parentID}
	a.ws.Folders = append(a.ws.Folders, f)
	a.persistWorkspace()
	return f, nil
}

// RenameFolder changes a folder's name.
func (a *App) RenameFolder(id string, name string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	for i := range a.ws.Folders {
		if a.ws.Folders[i].ID == id {
			a.ws.Folders[i].Name = name
			a.persistWorkspace()
			return nil
		}
	}
	return errors.New("folder not found")
}

// DeleteFolder removes a folder; its notes become uncategorized and any child
// folders are promoted to top level.
func (a *App) DeleteFolder(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := a.ws.Folders[:0]
	found := false
	for _, f := range a.ws.Folders {
		if f.ID == id {
			found = true
			continue
		}
		if f.ParentID == id {
			f.ParentID = ""
		}
		out = append(out, f)
	}
	if !found {
		return errors.New("folder not found")
	}
	a.ws.Folders = out
	for i := range a.ws.Notes {
		if a.ws.Notes[i].FolderID == id {
			a.ws.Notes[i].FolderID = ""
		}
	}
	a.persistWorkspace()
	return nil
}
