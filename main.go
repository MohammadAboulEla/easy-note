package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "EasyNote",
		Width:     1100,
		Height:    760,
		MinWidth:  720,
		MinHeight: 480,
		// Frameless: the custom (LTR-locked) title bar inside the app fully
		// replaces the OS window chrome. Drag via `--wails-draggable:drag`.
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Matches the dark theme --paper token (#16171a) so there is no flash
		// of a mismatched background before the frontend paints.
		BackgroundColour: &options.RGBA{R: 0x16, G: 0x17, B: 0x1a, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
