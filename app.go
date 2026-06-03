package main

import (
	"context"
	"os"
	"sync"
)

// Version metadata — the single source of truth for the app version. Update
// these on each release; the About dialog reads them via AppVersion(), and
// AppVersion (the marketing string) should be mirrored into wails.json's
// info.productVersion so the built .exe's file properties match.
const (
	appVersion = "1.0.0" // semantic/marketing version shown in About
	appBuild   = "240"   // build number shown in About
)

// VersionInfo is returned to the frontend for display (e.g. the About dialog).
type VersionInfo struct {
	Version string `json:"version"`
	Build   string `json:"build"`
}

// AppVersion returns the app version metadata for display in the UI.
func (a *App) AppVersion() VersionInfo {
	return VersionInfo{Version: appVersion, Build: appBuild}
}

// App is the Wails-bound application backend. It owns the on-disk workspace
// (notes/folders) and user settings, guarded by a mutex.
type App struct {
	ctx     context.Context
	mu      sync.Mutex
	dataDir string

	ws       Workspace
	settings Settings
	links    links // user-added linked folders/files (persisted in links.json)

	// inflight maps a tweak request ID to its cancel func so CancelTweak can
	// abort an in-progress AI call. Guarded by mu.
	inflight map[string]context.CancelFunc
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{inflight: make(map[string]context.CancelFunc)}
}

// startup is called when the app starts. The context is saved so we can call
// the runtime methods; on-disk state is loaded here.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.dataDir = appDataDir()

	// A truly fresh install has neither persisted notes nor linked roots. Detect
	// it before loading so we can seed sample content as real files on disk
	// rather than as invisible workspace.json entries.
	_, wsErr := os.Stat(a.workspacePath())
	_, linksErr := os.Stat(a.linksPath())
	freshInstall := os.IsNotExist(wsErr) && os.IsNotExist(linksErr)

	a.loadWorkspace()
	a.loadSettings()
	a.loadLinks()

	if freshInstall {
		a.mu.Lock()
		_, _ = a.seedVault()
		a.mu.Unlock()
	}
}
