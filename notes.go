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
}

// Note is a single markdown document. Body holds raw markdown.
type Note struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	FolderID  string `json:"folderId"` // "" = uncategorized
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
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

func seedWorkspace() Workspace {
	t := now()
	bt := "```" // fenced code-block delimiter (raw literals can't contain backticks)
	personal := Folder{ID: uuid.NewString(), Name: "Personal"}
	work := Folder{ID: uuid.NewString(), Name: "Work"}
	return Workspace{
		Folders: []Folder{personal, work},
		Notes: []Note{
			{ID: uuid.NewString(), Title: "Welcome", FolderID: personal.ID, CreatedAt: t, UpdatedAt: t,
				Body: "# Welcome to EasyNote\n\nA minimalist, **markdown-first** notebook with built-in AI editing.\n\n- Write in markdown\n- Toggle between edit and preview\n- Select a paragraph and ask AI to tweak it\n\n> Tip: open Settings to configure your AI provider and tune the appearance."},
			{ID: uuid.NewString(), Title: "Reading list", FolderID: personal.ID, CreatedAt: t, UpdatedAt: t,
				Body: "# Reading list\n\nMy books for **2026**.\n\n- Dune\n- Project Hail Mary\n- The Overstory\n\n> A quote I liked."},
			{ID: uuid.NewString(), Title: "Markdown cheatsheet", FolderID: personal.ID, CreatedAt: t, UpdatedAt: t,
				Body: "# Markdown cheatsheet\n\nA quick tour of what the preview can render.\n\n## Text\n\n**Bold**, *italic*, ~~strikethrough~~, `inline code`, and [a link](https://wails.io).\n\n## Lists\n\n1. First step\n2. Second step\n   - a nested bullet\n   - another one\n3. Third step\n\n- [x] Done task\n- [ ] Pending task\n\n## Table\n\n| Feature      | Status | Notes              |\n| ------------ | :----: | ------------------ |\n| Editor       |   ✅   | plain textarea     |\n| AI tweak     |   ✅   | select + prompt    |\n| Cloud sync   |   ❌   | not in v1          |\n\n## Quote\n\n> Simplicity is the ultimate sophistication.\n\n---\n\nThat horizontal rule above is a `---`."},
			{ID: uuid.NewString(), Title: "Python snippets", FolderID: work.ID, CreatedAt: t, UpdatedAt: t,
				Body: "# Python snippets\n\nSyntax highlighting is rendered server-side (goldmark + Chroma).\n\n## Fibonacci\n\n" + bt + "python\ndef fib(n: int) -> int:\n    \"\"\"Return the nth Fibonacci number.\"\"\"\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\n\nif __name__ == \"__main__\":\n    print([fib(i) for i in range(10)])\n" + bt + "\n\n## A small class\n\n" + bt + "python\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass Note:\n    title: str\n    body: str = \"\"\n\n    def word_count(self) -> int:\n        return len(self.body.split())\n" + bt + "\n\n## Complexity table\n\n| Operation | List | Dict |\n| --------- | :--: | :--: |\n| lookup    | O(n) | O(1) |\n| append    | O(1) | —    |\n| delete    | O(n) | O(1) |\n"},
			{ID: uuid.NewString(), Title: "Roadmap", FolderID: work.ID, CreatedAt: t, UpdatedAt: t,
				Body: "# Roadmap\n\n## Q3\n\n- Ship editor\n- Wire AI tweak\n"},
		},
	}
}

// ---- Bound CRUD API (exposed to the frontend) ----

// GetWorkspace returns the full note tree.
func (a *App) GetWorkspace() Workspace {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.ws
}

// CreateNote creates an empty note in the given folder ("" = uncategorized).
func (a *App) CreateNote(folderID string, title string) (Note, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if title == "" {
		title = "Untitled"
	}
	t := now()
	n := Note{ID: uuid.NewString(), Title: title, FolderID: folderID, Body: "", CreatedAt: t, UpdatedAt: t}
	a.ws.Notes = append(a.ws.Notes, n)
	a.persistWorkspace()
	return n, nil
}

// UpdateNote replaces title/body/folder of an existing note and stamps UpdatedAt.
func (a *App) UpdateNote(in Note) (Note, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
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

// DeleteNote removes a note by id.
func (a *App) DeleteNote(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
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
