package main

import (
	"context"
	"sync"
)

// App is the Wails-bound application backend. It owns the on-disk workspace
// (notes/folders) and user settings, guarded by a mutex.
type App struct {
	ctx     context.Context
	mu      sync.Mutex
	dataDir string

	ws       Workspace
	settings Settings
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved so we can call
// the runtime methods; on-disk state is loaded here.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.dataDir = appDataDir()
	a.loadWorkspace()
	a.loadSettings()
}
