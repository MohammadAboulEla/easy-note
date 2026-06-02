# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**EasyNote** — a minimalist, markdown-first desktop note app with inline AI editing.
Built on **Wails v2**: a Go backend + a React 18 / TypeScript / Vite frontend, shipped
as a single frameless desktop window (custom in-app title bar replaces the OS chrome).

- `PRD.md` — the v1 product spec (shipped as milestones M0–M7).
- `PRD2.md` — the **current** enhancement round; start there for in-flight work. It
  begins with a full orientation section and a per-feature file map.

## Commands

- **Dev (hot reload):** `wails dev` (run from repo root).
- **Build:** `wails build` → `EasyNote.exe`.
- **Frontend only:** `cd frontend && npm install && npm run build` (`tsc && vite build`).
- After adding/changing a Go method bound on `App`, Wails **regenerates** the JS bindings
  under `frontend/wailsjs/go/main/App.*` on the next `wails dev`/`wails build`. Import
  bound methods from `../../wailsjs/go/main/App`.

## Architecture

**Go backend (package `main`, repo root):**
- `main.go` — Wails bootstrap; frameless window; binds the single `App` struct.
- `app.go` — `App` struct (`ctx`, `mu sync.Mutex`, `dataDir`, `ws`, `settings`) + `startup`.
  **Everything exposed to the frontend is a method on `App`.**
- `notes.go` — Note/Folder model + JSON store + CRUD bindings.
- `settings.go` — Go `Settings` struct + load/save (JSON under the OS config dir, e.g.
  `%APPDATA%/EasyNote`). **Source of truth for persistence** — keep it in sync with the
  TS `Settings` interface; a TS-only field will not persist.
- `ai.go` — OpenAI-compatible client: `TweakText(TweakRequest)`, `TestConnection`. System
  prompt + temperature (`0.4`) are currently hardcoded; uses app-level `a.ctx`.

**Frontend (`frontend/src/`):**
- `App.tsx` — shell + 3 layout modes (`classic` / `three-pane` / `focus`); `modal` state
  drives dialogs; global shortcuts (`Ctrl+S/N/\`).
- `state/settings.ts` — `Settings`/`Appearance` interfaces, `DEFAULT_SETTINGS`,
  `applySettings()` (writes CSS custom properties + `data-theme`/`dir` onto `<html>`).
- `state/useSettings.ts` — loads from Go (`GetSettings`), debounced save (`SaveSettings`),
  `setTheme/setAccent/patchAppearance/patchApi` helpers.
- `state/useWorkspace.ts` — notes/folders + active note.
- `components/` — `TitleBar`, `MenuBar`, `StatusBar`, `Sidebar` (classic), `RailList`
  (three-pane), `Editor` (plain `<textarea>` `.md-input` + AI flow + formatting),
  `AiOverlay`, `SettingsDialog` (tabs API/Appearance/Editor/Shortcuts), `AboutDialog`.
- `lib/markdown.ts` — `renderMarkdown(md): Promise<string>` (currently marked + DOMPurify,
  lazy-imported). **PRD2 moves this to the Go backend (goldmark).**
- `styles/theme.css` — design tokens (light/dark palettes, fonts, `--reading-*` vars) +
  app grid. `styles/app.css` — component styles.

**Editor caret note:** `Editor.tsx` is a plain textarea. After any programmatic write
(`onChange(newBody)`), the caret/selection is restored via `pendingSel.current` plus a
`useLayoutEffect` keyed on `body`. Any new edit operation must follow this pattern.

## Conventions (must follow)

- **CSS:** drive everything through global CSS custom properties on `:root`/`[data-theme]`;
  reference `var(--token)`; keep CSS plain and hand-editable in `theme.css`/`app.css`.
  **No CSS-in-JS, no generated/obfuscated styles.** (The user hand-edits CSS often and
  wants one obvious place to change any token.)
- **React perf:** never define components inside components (causes editor remount / lost
  focus); derive state during render over `useEffect`+`setState`; lazy-`import()` heavy
  deps; guard `localStorage` in try/catch (Go is the source of truth for notes/settings).
- **Aesthetic:** refined-minimal. Keep the Atkinson Hyperlegible + Caveat fonts — never
  fall back to Inter/Roboto/Arial. Calm greyscale + a single accent.
- **Direction:** LTR/RTL is supported app-wide, **except** the in-app title bar and
  menubar, which are always LTR (`direction: ltr` on `.menubar`; menubar dropdowns anchor
  LTR regardless of `dir`).
- **Adding a persisted setting:** update TS `Appearance`/`Settings` *and* the Go `Settings`
  struct in `settings.go`, add a `patch*` helper in `useSettings.ts`, and add a token in
  `applySettings()` if it drives CSS.
- **Adding a modal:** add a value to `App.tsx`'s `modal` union and render it like
  `SettingsDialog`/`AboutDialog`; reuse `AboutDialog.tsx`'s overlay markup/classes.

## Current focus — PRD2 enhancements

In progress (see `PRD2.md` for full per-feature detail, exact files, and acceptance tests):

1. **Writing UX** — list continuation on Enter, Tab/Shift+Tab indent, smart Enter
   (Obsidian-like), in `Editor.tsx`'s `onKeyDown`.
2. **Markdown engine** — move rendering to Go (`goldmark` + `bluemonday`) with
   `goldmark-highlighting` (Chroma) class-based syntax highlighting for all common
   languages; drop frontend `marked`/`dompurify`.
3. **Appearance** — add reading-area **text color** swatches (alongside page background).
4. **Sidebar collapse** — visible collapse button in classic mode + collapsible list in
   three-pane (both honor `Ctrl+\`).
5. **Focus mode fix** — make it editable (stop forcing preview) and remove the dead area
   under the status bar.
6. **Undo/redo** — custom history hook (native undo breaks on programmatic writes), word-
   coalesced typing, `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`; rewire Edit-menu items.
7. **Help → Markdown guide** — carousel tutorial modal (`GuideDialog.tsx`).
8. **AI cancel** — true backend cancellation (`inflight` map + `CancelTweak(id)` binding)
   with a Cancel button in the "Thinking…" overlay.
9. **Settings → AI tab** — user-tunable system prompt, tone, language, verbosity,
   temperature, and custom commands that surface as overlay chips.

Defaults: dark theme, orange accent (`#e0613a`). Non-goals (v1): cloud sync, accounts,
collaboration, plugins, mobile/web builds.
