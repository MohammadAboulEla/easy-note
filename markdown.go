package main

import (
	"bytes"
	"strings"
	"sync"
	"unicode"

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

// sanitizeRTL cleans the invisible characters RTL keyboards/IMEs inject around
// Arabic/Persian/Hebrew text, which silently break CommonMark emphasis. The
// flanking rule decides whether "**" can open/close emphasis from the adjacent
// character; an invisible zero-width or bidi-format char sitting between "**"
// and the letter is treated as whitespace/punctuation, so the "**" renders
// literally. goldmark parses *clean* Arabic bold fine — the marks are the whole
// problem. This runs only at render time, so the stored note is left
// byte-for-byte as the user typed it.
//
// It handles two classes the narrow bidi-only strip missed:
//   - all zero-width & bidi-format runes (RLM/LRM, ZWNJ/ZWJ, ZWSP, BOM,
//     embeddings/overrides/isolates) — removed via Unicode category Cf plus an
//     explicit ZWSP check;
//   - non-breaking spaces (NBSP, narrow NBSP) — folded to a normal space so
//     "** نص **"-style markers still flank correctly.
//
// Code points are written numerically on purpose: pasting these invisible runes
// as literal glyphs corrupts the source (a raw U+FEFF is even an illegal BOM).
const (
	zwsp  = '​' // ZERO WIDTH SPACE
	nbsp  = ' ' // NO-BREAK SPACE
	nnbsp = ' ' // NARROW NO-BREAK SPACE
)

func sanitizeRTL(md string) string {
	if !strings.ContainsFunc(md, isInvisibleOrNBSP) {
		return md // fast path: nothing to clean (the common all-LTR case)
	}
	var b strings.Builder
	b.Grow(len(md))
	for _, r := range md {
		switch {
		case r == nbsp || r == nnbsp: // fold to a normal space so markers flank
			b.WriteByte(' ')
		case isInvisible(r): // drop zero-width / bidi-format characters
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// isInvisible reports whether r is a zero-width or bidi-format control that has
// no visible glyph but can derail CommonMark's emphasis flanking. Unicode
// category Cf ("Format") covers RLM/LRM, embeddings, overrides, isolates, the
// BOM, and the zero-width joiners (ZWNJ U+200C, ZWJ U+200D) Arabic/Persian use;
// ZWSP (U+200B) is not in Cf, so it's checked explicitly.
func isInvisible(r rune) bool {
	return r == zwsp || unicode.Is(unicode.Cf, r)
}

func isInvisibleOrNBSP(r rune) bool {
	return r == nbsp || r == nnbsp || isInvisible(r)
}

// RenderMarkdown converts a markdown string to sanitized HTML with class-based
// syntax highlighting. Bound on App and called from the frontend.
func (a *App) RenderMarkdown(md string) (string, error) {
	mdOnce.Do(initMarkdown)
	md = sanitizeRTL(md)
	var buf bytes.Buffer
	if err := mdEngine.Convert([]byte(md), &buf); err != nil {
		return "", err
	}
	return mdPolicy.Sanitize(buf.String()), nil
}
