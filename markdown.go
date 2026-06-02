package main

import (
	"bytes"
	"sync"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

// The markdown engine is built once and reused (goldmark is goroutine-safe).
// Syntax highlighting emits Chroma CSS classes (WithClasses) rather than inline
// styles, so the app's light/dark theme can color code via class-based CSS.
var (
	mdOnce   sync.Once
	mdEngine goldmark.Markdown
	mdPolicy *bluemonday.Policy
)

func initMarkdown() {
	mdEngine = goldmark.New(
		goldmark.WithExtensions(
			extension.GFM, // tables, task lists, strikethrough, autolinks
			highlighting.NewHighlighting(
				highlighting.WithFormatOptions(
					chromahtml.WithClasses(true),
				),
			),
		),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
		goldmark.WithRendererOptions(
			html.WithHardWraps(), // match the previous breaks:true behavior
		),
	)

	// Sanitize, but keep the structure Chroma and GFM need: class attributes on
	// code/span/pre (highlight tokens), heading IDs, task-list checkboxes, and
	// table alignment.
	p := bluemonday.UGCPolicy()
	p.AllowAttrs("class").OnElements("code", "span", "pre", "div")
	p.AllowAttrs("id").OnElements("h1", "h2", "h3", "h4", "h5", "h6")
	p.AllowAttrs("type", "checked", "disabled").OnElements("input")
	p.AllowAttrs("align").OnElements("td", "th")
	mdPolicy = p
}

// RenderMarkdown converts a markdown string to sanitized HTML with class-based
// syntax highlighting. Bound on App and called from the frontend.
func (a *App) RenderMarkdown(md string) (string, error) {
	mdOnce.Do(initMarkdown)
	var buf bytes.Buffer
	if err := mdEngine.Convert([]byte(md), &buf); err != nil {
		return "", err
	}
	return mdPolicy.Sanitize(buf.String()), nil
}
