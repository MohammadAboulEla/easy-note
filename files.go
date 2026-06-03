package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Linked files/folders let the user work with real .md files in their original
// locations. The app never moves or copies them: it indexes the paths the user
// adds and reads/writes the files in place. Only the list of added paths is
// persisted (links.json); the notes/folders themselves are rebuilt by scanning.
//
// Stable IDs: a linked folder's id is "linked:" + its absolute directory path; a
// linked note's id is "linked:" + its absolute file path. This makes ids survive
// restarts and lets CRUD derive the on-disk target straight from the id.

const linkPrefix = "linked:"

// links is the persisted set of user-added roots.
type links struct {
	// Folders are directories indexed recursively for .md files.
	Folders []string `json:"folders"`
	// Files are single .md files added on their own.
	Files []string `json:"files"`
}

func (a *App) linksPath() string { return filepath.Join(a.dataDir, "links.json") }

// loadLinks reads links.json (absent on first run is fine).
func (a *App) loadLinks() {
	data, err := os.ReadFile(a.linksPath())
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &a.links)
}

// persistLinks writes links.json. Callers hold a.mu.
func (a *App) persistLinks() {
	data, err := json.MarshalIndent(a.links, "", "  ")
	if err != nil {
		return
	}
	tmp := a.linksPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, a.linksPath())
}

// linkedFolderID / linkedNoteID build the stable ids from absolute paths.
func linkedFolderID(dir string) string { return linkPrefix + dir }
func linkedNoteID(path string) string  { return linkPrefix + path }

// linkedNotePath returns the file path for a linked-note id, or ("", false).
func linkedNotePath(id string) (string, bool) {
	if s, ok := strings.CutPrefix(id, linkPrefix); ok {
		return s, true
	}
	return "", false
}

// linkedFolderDir returns the directory for a "linked:<dir>" folderID. It is the
// same encoding as linkedNotePath but named for the CreateNote call site.
func linkedFolderDir(folderID string) (string, bool) {
	return linkedNotePath(folderID)
}

// titleFromPath turns "ideas/my note.md" into "my note".
func titleFromPath(path string) string {
	base := filepath.Base(path)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

func isMarkdown(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md", ".markdown", ".mdown", ".mkd":
		return true
	}
	return false
}

// readNoteFile reads one .md file into a linked Note. fid is the owning folder id
// ("" for a standalone file).
func readNoteFile(path, fid string) (Note, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Note{}, err
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return Note{}, err
	}
	ts := info.ModTime().UnixMilli()
	return Note{
		ID:        linkedNoteID(path),
		Title:     titleFromPath(path),
		Body:      string(body),
		FolderID:  fid,
		CreatedAt: ts,
		UpdatedAt: ts,
		Linked:    true,
		Path:      path,
	}, nil
}

// scanLinks builds synthetic folders/notes from the linked roots. It tolerates
// roots that have since been deleted/moved (they are simply skipped). Callers
// hold a.mu.
func (a *App) scanLinks() ([]Folder, []Note) {
	var folders []Folder
	var notes []Note

	for _, dir := range a.links.Folders {
		abs, err := filepath.Abs(dir)
		if err != nil {
			abs = dir
		}
		info, err := os.Stat(abs)
		if err != nil || !info.IsDir() {
			continue
		}
		fid := linkedFolderID(abs)
		folders = append(folders, Folder{
			ID:     fid,
			Name:   filepath.Base(abs),
			Linked: true,
			Path:   abs,
		})
		_ = filepath.WalkDir(abs, func(p string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !isMarkdown(d.Name()) {
				return nil
			}
			if n, e := readNoteFile(p, fid); e == nil {
				notes = append(notes, n)
			}
			return nil
		})
	}

	for _, f := range a.links.Files {
		abs, err := filepath.Abs(f)
		if err != nil {
			abs = f
		}
		if info, err := os.Stat(abs); err != nil || info.IsDir() {
			continue
		}
		if n, e := readNoteFile(abs, ""); e == nil {
			notes = append(notes, n)
		}
	}

	sort.Slice(notes, func(i, j int) bool { return notes[i].Title < notes[j].Title })
	return folders, notes
}

// writeLinkedNote writes a linked note's body back to its file in place.
func (a *App) writeLinkedNote(in Note) (Note, error) {
	path, ok := linkedNotePath(in.ID)
	if !ok || in.Path == "" {
		return Note{}, errors.New("not a linked note")
	}
	if err := os.WriteFile(path, []byte(in.Body), 0o644); err != nil {
		return Note{}, err
	}
	in.UpdatedAt = now()
	return in, nil
}

// createLinkedNote creates a new .md file in dir and returns it as a linked note.
// The title is slugified into a unique filename so two "Untitled" notes coexist.
func (a *App) createLinkedNote(dir, title string) (Note, error) {
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return Note{}, errors.New("linked folder not found")
	}
	base := sanitizeFilename(title)
	if base == "" {
		base = "Untitled"
	}
	path := filepath.Join(dir, base+".md")
	for i := 2; ; i++ {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			break
		}
		path = filepath.Join(dir, base+"-"+itoa(i)+".md")
	}
	if err := os.WriteFile(path, []byte(""), 0o644); err != nil {
		return Note{}, err
	}
	return readNoteFile(path, linkedFolderID(dir))
}

// moveLinkedFile moves a linked .md file into dstDir, resolving filename
// collisions, and returns it as a linked note under the destination folder.
func (a *App) moveLinkedFile(srcPath, dstDir string) (Note, error) {
	if info, err := os.Stat(dstDir); err != nil || !info.IsDir() {
		return Note{}, errors.New("target folder not found")
	}
	if filepath.Dir(srcPath) == dstDir {
		// Already in the target folder; nothing to do.
		return readNoteFile(srcPath, linkedFolderID(dstDir))
	}
	base := strings.TrimSuffix(filepath.Base(srcPath), filepath.Ext(srcPath))
	dst := filepath.Join(dstDir, base+".md")
	for i := 2; ; i++ {
		if _, err := os.Stat(dst); os.IsNotExist(err) {
			break
		}
		dst = filepath.Join(dstDir, base+"-"+itoa(i)+".md")
	}
	if err := os.Rename(srcPath, dst); err != nil {
		return Note{}, err
	}
	return readNoteFile(dst, linkedFolderID(dstDir))
}

// itoa avoids importing strconv for one use.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// sanitizeFilename strips characters illegal in Windows/Unix filenames.
func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	const bad = `<>:"/\|?*`
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r < 0x20 || strings.ContainsRune(bad, r) {
			out = append(out, '-')
			continue
		}
		out = append(out, r)
	}
	return strings.TrimRight(strings.TrimSpace(string(out)), ". ")
}

// ---- First-run seeding (real files on disk) ----
//
// On a truly fresh install we create a real "EasyNote" vault folder on disk and
// write the welcome/sample notes into it as actual .md files, then register the
// folder as a linked root. This keeps the app's model uniform — every note is a
// real file in a known location — with no invisible workspace.json entries. The
// user can move, edit, or delete these like any other note.

// seedFile is one sample note written to disk on first run.
type seedFile struct {
	name string // filename without extension
	body string
}

// makeVaultDir creates an "EasyNote" directory inside parent, suffixing a number
// if one already exists, and returns its absolute path. It returns an error if
// the directory cannot be created (e.g. a non-writable redirected special folder).
func makeVaultDir(parent string) (string, error) {
	dir := filepath.Join(parent, "EasyNote")
	for i := 2; ; i++ {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			break
		}
		dir = filepath.Join(parent, "EasyNote-"+itoa(i))
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = dir
	}
	return abs, nil
}

// seedVault creates the on-disk vault and sample files, returning the absolute
// vault path. Callers hold a.mu. It is idempotent-ish: if an "EasyNote" folder
// already exists at the target it suffixes a number rather than overwriting.
func (a *App) seedVault() (string, error) {
	// Seed into the app data dir (%APPDATA%/EasyNote on Windows) — the same
	// always-writable location the app's JSON metadata uses. We avoid the user's
	// Documents folder: on Windows it is often a redirected/ReadOnly junction that
	// os.Stat reports as present yet os.MkdirAll cannot write into.
	dir, err := makeVaultDir(a.dataDir)
	if err != nil {
		return "", err
	}
	for _, f := range seedFiles() {
		path := filepath.Join(dir, sanitizeFilename(f.name)+".md")
		_ = os.WriteFile(path, []byte(f.body), 0o644)
	}
	if !contains(a.links.Folders, dir) {
		a.links.Folders = append(a.links.Folders, dir)
		a.persistLinks()
	}
	return dir, nil
}

// seedFiles is the sample content shipped on first run, as real .md files.
func seedFiles() []seedFile {
	bt := "```" // fenced code-block delimiter (raw literals can't contain backticks)
	return []seedFile{
		{name: "Welcome", body: "# Welcome to EasyNote\n\nA minimalist, **markdown-first** notebook with built-in AI editing.\n\n- Write in markdown\n- Toggle between edit and preview\n- Select a paragraph and ask AI to tweak it\n\n> Tip: open Settings to configure your AI provider and tune the appearance.\n\nEvery note you see is a real `.md` file in this folder on your disk — move, rename, or delete them freely."},
		{name: "Reading list", body: "# Reading list\n\nMy books for **2026**.\n\n- Dune\n- Project Hail Mary\n- The Overstory\n\n> A quote I liked."},
		{name: "Markdown cheatsheet", body: "# Markdown cheatsheet\n\nA quick tour of what the preview can render.\n\n## Text\n\n**Bold**, *italic*, ~~strikethrough~~, `inline code`, and [a link](https://wails.io).\n\n## Lists\n\n1. First step\n2. Second step\n   - a nested bullet\n   - another one\n3. Third step\n\n- [x] Done task\n- [ ] Pending task\n\n## Table\n\n| Feature      | Status | Notes              |\n| ------------ | :----: | ------------------ |\n| Editor       |   ✅   | plain textarea     |\n| AI tweak     |   ✅   | select + prompt    |\n| Cloud sync   |   ❌   | not in v1          |\n\n## Quote\n\n> Simplicity is the ultimate sophistication.\n\n---\n\nThat horizontal rule above is a `---`."},
		{name: "Python snippets", body: "# Python snippets\n\nSyntax highlighting is rendered server-side (goldmark + Chroma).\n\n## Greeting\n\n" + bt + "python\ndef greet(name: str, *, excited: bool = False) -> str:\n    \"\"\"Return a friendly greeting.\"\"\"\n    punctuation = \"!\" if excited else \".\"\n    return f\"Hello, {name}{punctuation}\"\n\n\nprint(greet(\"world\", excited=True))\n" + bt + "\n\n## A small class\n\n" + bt + "python\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass Note:\n    title: str\n    body: str = \"\"\n\n    def word_count(self) -> int:\n        return len(self.body.split())\n" + bt + "\n\n## Complexity table\n\n| Operation | List | Dict |\n| --------- | :--: | :--: |\n| lookup    | O(n) | O(1) |\n| append    | O(1) | —    |\n| delete    | O(n) | O(1) |\n"},
		{name: "Roadmap", body: "# Roadmap\n\n## Q3\n\n- Ship editor\n- Wire AI tweak\n"},
	}
}

// ---- Bound API: native pickers + link management ----

// OpenFolder shows a directory picker and adds the chosen folder as a linked
// root. Returns the absolute path added, or "" if the user cancelled.
func (a *App) OpenFolder() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open folder of markdown files",
	})
	if err != nil || dir == "" {
		return "", err
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = dir
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !contains(a.links.Folders, abs) {
		a.links.Folders = append(a.links.Folders, abs)
		a.persistLinks()
	}
	return abs, nil
}

// NewFolderOnDisk asks the user for a parent location, creates a new directory
// named `name` inside it, and adds it as a linked folder. Returns the linked
// folder id, or "" if the user cancelled.
func (a *App) NewFolderOnDisk(name string) (string, error) {
	parent, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose where to create the folder",
	})
	if err != nil || parent == "" {
		return "", err
	}
	base := sanitizeFilename(name)
	if base == "" {
		base = "New Folder"
	}
	dir := filepath.Join(parent, base)
	for i := 2; ; i++ {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			break
		}
		dir = filepath.Join(parent, base+"-"+itoa(i))
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = dir
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !contains(a.links.Folders, abs) {
		a.links.Folders = append(a.links.Folders, abs)
		a.persistLinks()
	}
	return linkedFolderID(abs), nil
}

// OpenFile shows a markdown file picker and adds the chosen file as a standalone
// linked note. Returns the linked note id, or "" if cancelled.
func (a *App) OpenFile() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open a markdown file",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown (*.md;*.markdown)", Pattern: "*.md;*.markdown;*.mdown;*.mkd"},
			{DisplayName: "All files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil || path == "" {
		return "", err
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !contains(a.links.Files, abs) {
		a.links.Files = append(a.links.Files, abs)
		a.persistLinks()
	}
	return linkedNoteID(abs), nil
}

// CloseLink removes a linked root (folder id or file note id) from the index.
// The files on disk are left untouched.
func (a *App) CloseLink(id string) error {
	target, ok := linkedNotePath(id)
	if !ok {
		return errors.New("not a linked id")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.links.Folders = remove(a.links.Folders, target)
	a.links.Files = remove(a.links.Files, target)
	a.persistLinks()
	return nil
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func remove(s []string, v string) []string {
	out := s[:0]
	for _, x := range s {
		if x != v {
			out = append(out, x)
		}
	}
	return out
}
