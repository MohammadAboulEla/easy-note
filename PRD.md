# EasyNote — Product Requirements Document

> A minimalist, markdown-first desktop notebook with built-in AI editing.
> Built on **Wails v2** (Go backend + React 18 / TypeScript / Vite frontend).

- **Status:** Draft v1 — ready to start implementation
- **Last updated:** 2026-06-02
- **Source design:** `EasyNote Wireframes.html` (Claude Design handoff bundle, `easy-note/`)
- **Target codebase:** this repo (`memo`, Wails React-TS template)

---

## 1. Summary

EasyNote is a desktop note-taking app for people who write in Markdown and want a
calm, distraction-light workspace. It pairs a classic notebook UI (sidebar +
editor + status bar) with an inline **"select text → ask AI to tweak it"** flow,
backed by any OpenAI-compatible API. The whole surface is themeable (light/dark,
five accent colors, reading-area tints, fonts, width, spacing) and supports both
**LTR and RTL** layouts — except the window title bar, which always stays LTR.

This PRD turns the exploratory wireframes into a single, shippable application.
Where the wireframes showed 3 variants, the chosen directions are recorded in
§4 (Locked decisions).

---

## 2. Goals & non-goals

### Goals
- A real, usable Markdown note app — create, edit, organize, and persist notes locally.
- Inline AI paragraph-tweaking wired to a real OpenAI-compatible endpoint.
- Deep, live-previewing appearance controls (theme, accent, page tint, font, width, spacing).
- Full light/dark and LTR/RTL support, defaulting to **dark + orange accent**.
- Faithful reproduction of the wireframe's visual language (greyscale-clean → themed).

### Non-goals (v1)
- Cloud sync, multi-device, or accounts.
- Real-time collaboration.
- Plugin/extension system.
- Mobile or web builds (desktop only via Wails).
- Rich embeds beyond standard Markdown (no Notion-style databases).

---

## 3. Users & primary scenarios

- **The markdown writer** — keeps reading lists, journals, meeting notes; wants fast
  capture, folders, search, and a clean reading view.
- **The reluctant editor** — drafts roughly, then selects a paragraph and asks AI to
  "Improve", "Shorten", "Fix grammar", or runs a custom prompt; reviews a before/after
  diff before anything changes.
- **The comfort-tuner** — cares about eye comfort: dark theme, sepia page tint, serif
  font, wider line spacing, constrained content width.

Core loop: open app → pick/create note → write Markdown → (optionally) select text →
AI tweak → review diff → apply → auto-save.

---

## 4. Locked decisions (resolved from wireframe variants)

| Area | Decision | Wireframe origin |
|------|----------|------------------|
| **Build target** | One cohesive functional app window (not the 5-tab gallery) | — |
| **Window layout** | **All three** available, switchable at runtime via the **View** menu: Classic two-pane (default), Three-pane (rail + list), Focus/Zen | Layout A / B / C |
| **Sidebar** | **Folder tree** (Notebooks → folders → notes) with Search + New Note | Sidebar A |
| **Editor** | **Toggle Edit / Preview** (single pane, flip between raw and rendered) | Editor B |
| **AI tweak** | Full UI shell **+ real wiring** to an OpenAI-compatible API using the key from Settings | AI 1–3 |
| **Defaults** | Dark theme, orange accent (`#e0613a`) | per chat |
| **Title bar** | Always LTR, even in RTL mode | per chat |

Three-pane and Focus reuse the same data + editor; only the chrome around the editor changes.

---

## 5. Design system (extracted from `wireframe.css`)

Implement as CSS custom properties on `:root` / `[data-theme="dark"]`, toggled live.

### Color tokens

**Light (`:root`)**
```
--accent: #e0613a   (default; user-selectable)
--paper:  #f4f4f2   --win: #fbfbfa   --chrome: #ececea   --chrome-2: #e2e2df
--ink:    #2c2c2c   --ink-soft: #6b6b68
--stroke: #cfcfca   --stroke-strong: #2c2c2c
--fill:   #e9e9e6   --fill-2: #dededa
--bar:    #d4d4cf   --bar-2: #c5c5bf
```

**Dark (`[data-theme="dark"]`)**
```
--paper: #16171a    --win: #1e2024   --chrome: #26282d   --chrome-2: #2d3036
--ink:   #e9e9ea    --ink-soft: #9b9ca0
--stroke:#3a3d44    --stroke-strong: #c9cbd0
--fill:  #2a2d33    --fill-2: #34373e
--bar:   #3a3d44    --bar-2: #4a4e56
```

**Derived accents**
```
--accent-soft: color-mix(in oklch, var(--accent) 16%, transparent)
--accent-line: color-mix(in oklch, var(--accent) 45%, transparent)
```

**Accent swatches (selectable):** `#5b6cff` `#1f9d6b` `#e0613a` `#a755d4` `#d4a017` (+ `#e5484d` in Settings)

**Reading-area page tints:** `#fbfbfa` `#f7f1e3` (sepia) `#eef4ef` (mint) `#1e2024` `#2b2620`

### Typography
- UI font: **Atkinson Hyperlegible**, fallback `system-ui, sans-serif`.
- Hand/annotation font: **Caveat** (used for wireframe annotations only — drop or keep as a flourish).
- Reading font is user-selectable: **Sans / Serif (Georgia) / Mono (ui-monospace)**.
- Reading defaults: size **16px**, line spacing **1.7**, content width **680px**.

### Shape & motion
- Radius token `--r: 7px`; windows 9px; dialogs 12px; pills 20px.
- Theme transitions: `transition: background .25s, color .25s` on `body`.
- Window shadow: `0 18px 40px -22px rgba(0,0,0,.45)`.

### Key components (selectors to port)
`titlebar` (LTR-locked), `menubar`, `statusbar`, `sidebar` (+ `.collapsed`),
`search`, `btn-new`, `tree/.folder/.note-item/.tag-chip`, `fmtbar` + `seg-sm`,
`page`/`page.reading`, `real` (rendered markdown), `bubble` (AI quick actions),
`ai-pop` (custom prompt + chips), `ai-diff` (old/new + actions),
`dlg`/`dlg-backdrop`/`dlg-nav` (Settings/About), `toggle`, `slider-row`, `theme-swatches`, `opt-row`.

> RTL: `[dir="rtl"]` mirrors sidebar borders, note-item padding, dialog close button, doc text-align — but **never** the title bar.

---

## 6. Functional requirements

### 6.1 Window chrome
- Custom **title bar**: app icon, dynamic title (`EasyNote — <note>.md`), and
  minimize / maximize / close controls wired to Wails runtime
  (`WindowMinimise`, `WindowToggleMaximise`, `Quit`). Frameless window, LTR-locked.
- **Menu bar**: File, Edit, View, Insert, Help. `View` holds layout switch
  (Classic / Three-pane / Focus), theme toggle, and direction toggle. `Help` opens About.
- **Status bar**: markdown/focus indicator (accent), word count, `Ln, Col`,
  encoding (UTF-8), and direction. Updates live from the editor.

### 6.2 Sidebar (collapsible)
- New Note button (accent), Search box, Notebooks tree with collapsible folders and notes.
- Active note highlighted with `--accent-soft`.
- Collapsible to an icon rail (drives the Three-pane and Focus layouts).
- Search filters notes by title/content.

### 6.3 Editor & Markdown
- Format toolbar (`fmtbar`): Bold, Italic, Heading, Quote, Code + an Edit/Preview segmented toggle.
- **Edit mode:** raw Markdown in a textarea/contenteditable.
- **Preview mode:** rendered Markdown in the `.real` reading container, honoring
  the user's page tint, font, size, width, and spacing.
- Markdown rendering via a vetted library (`marked`) with sanitization (`DOMPurify`)
  for AI/imported content.

### 6.4 AI "tweak this paragraph"
Three-step inline flow (wireframe AI 1→2→3):
1. **Quick-action bubble** appears above a text selection: `✦ Improve · Shorten · Fix grammar · Ask…`.
2. **Custom prompt** — "Ask…" expands `ai-pop` with a prompt field and preset chips
   (Improve writing, Summarize, Make formal, Translate, Fix grammar).
3. **Review & apply** — show before/after `ai-diff` (old strikethrough, new highlighted);
   actions: **Replace**, **Insert below**, **Discard**. Nothing changes until chosen.
- Backend `TweakText(action/prompt, selectedText)` calls the configured OpenAI-compatible
  chat endpoint and returns the rewrite. Loading + error states required.

### 6.5 Settings (modal, tabbed: API / Appearance / Editor / Shortcuts)
- **API:** Provider (OpenAI-compatible), API Key (masked, stored locally only),
  Base URL, Model, "Stream responses" toggle, **Test connection**, Save.
- **Appearance:** Theme (Light/Dark/System), Accent swatches, Page background tints,
  Content width slider, Font family (Sans/Serif/Mono), Font size slider, Line spacing slider.
  All controls **live-preview**.
- **Editor / Shortcuts:** present as tabs (can ship minimal in v1).

### 6.6 About (modal)
- Logo, "EasyNote", version + build, one-line description, links (Website / Licenses /
  Check for updates), Close.

### 6.7 Persistence (Go backend)
- Notes, folders, and settings persisted locally (JSON store under the OS config dir,
  e.g. `%APPDATA%/EasyNote`). Auto-save on edit (debounced).
- API key stored locally only; never logged or transmitted except to the configured endpoint.

---

## 7. Architecture

```
main.go            Wails bootstrap — frameless window, dark bg, bind App
app.go             App struct + lifecycle (startup/context)
notes.go           Note/Folder CRUD + JSON store (NEW)
settings.go        Settings load/save, API config (NEW)
ai.go              OpenAI-compatible client: TweakText, TestConnection (NEW)

frontend/src/
  App.tsx          Shell: title bar + menu + body + status bar; layout switch
  state/           Note store hook, settings/theme context
  components/
    TitleBar, MenuBar, StatusBar
    Sidebar (tree, search, new-note; rail mode)
    Editor (fmtbar, edit/preview, markdown render)
    AiBubble, AiPrompt, AiDiff
    SettingsDialog (API/Appearance/Editor/Shortcuts)
    AboutDialog
  styles/theme.css  Ported design tokens + component styles from wireframe.css
```

Go ↔ JS via Wails bindings (`wailsjs/go/main/App`). Frontend deps to add:
`marked`, `dompurify` (+ `@types/dompurify`).

### 7.1 Engineering guidelines

Two repo skills (`.agents/skills/`) plus an explicit user preference govern implementation:

**Aesthetic — `frontend-design`:** Treat the wireframe as a committed *refined-minimal*
direction and execute it with precision. Keep the characterful, non-generic fonts
(Atkinson Hyperlegible + Caveat — never fall back to Inter/Roboto/Arial). Attention to
spacing, subtle shadows, and the calm greyscale-with-one-accent palette is the whole point.
Subtle, purposeful micro-interactions (theme transition, bubble pop, diff reveal) over noise.

**Performance — `vercel-react-best-practices`** (the SPA-relevant subset; this is Wails, not Next.js):
- Don't define components inside components; pass props (avoids remounts / lost focus in the editor).
- Derive state during render instead of `useEffect` + `setState`; narrow effect deps to primitives.
- `useTransition` / `useDeferredValue` for non-urgent updates (live preview re-render, search filtering).
- Dynamic-`import()` heavy deps (the Markdown renderer) so they don't bloat the initial chunk; avoid barrel imports.
- Version + guard `localStorage` reads/writes in try/catch (UI prefs like last layout); the source of truth for notes/settings is the Go side.
- Explicit ternary conditional rendering (not `&&`); `Set`/`Map` for lookups; early returns.

**CSS authoring — user preference (must follow):** The user hand-edits CSS often. Drive
*everything* through global CSS custom properties on `:root` / `[data-theme]`, reference
`var(--token)` everywhere, and keep component CSS plain and readable in a single `theme.css`
(or small, obvious files) — **no CSS-in-JS, no generated/obfuscated styles**. One obvious
place to change any token.

---

## 8. Milestones

> Each milestone is independently demoable. Suggested order; M1–M4 are the core path.

### M0 — Project reset & design tokens  *(foundation)*
- Strip the template (`Greet`, logo, demo CSS).
- **Frameless window** in `main.go` so the custom LTR title bar fully replaces the OS chrome:
  ```go
  wails.Run(&options.App{
      Title:     "EasyNote",
      Frameless: true,
      // dark default background to match --paper (dark): #16171a
      BackgroundColour: &options.RGBA{R: 0x16, G: 0x17, B: 0x1a, A: 1},
      // ...
  })
  ```
  Note: with `Frameless: true`, drag the window via a `--wails-draggable:drag` style on the
  title bar, and wire min/max/close to the Wails runtime (`WindowMinimise`,
  `WindowToggleMaximise`, `Quit`).
- Port color/typography tokens into `styles/theme.css`; load Atkinson Hyperlegible.
- Theme/dir/accent toggles flip CSS variables live.
- **Done when:** blank themed window renders; toggling theme/accent/dir visibly changes the shell.

### M1 — Window shell  *(chrome)*
- Title bar (LTR-locked) with working min/max/close; dynamic title.
- Menu bar with View → layout/theme/dir; Help → About.
- Status bar bound to live editor stats.
- **Done when:** chrome matches the wireframe in light & dark, LTR & RTL (title bar stays LTR).

### M2 — Sidebar + notes data  *(persistence)*
- Go `notes.go`: Note/Folder model, JSON store, CRUD bindings.
- Folder-tree sidebar with New Note, search, collapsible folders, active highlight.
- Collapse to icon rail.
- **Done when:** can create/rename/delete notes & folders; survives restart; search filters.

### M3 — Editor & Markdown  *(core editing)*
- Format toolbar + Edit/Preview toggle.
- Raw editing + rendered preview (`marked` + `DOMPurify`).
- Debounced auto-save; word count / Ln,Col feed the status bar.
- **Done when:** write Markdown, toggle to a correctly rendered, theme-aware preview; edits persist.

### M4 — AI tweak flow  *(differentiator)*
- `ai.go`: OpenAI-compatible `TweakText` + `TestConnection`.
- Selection → quick-action bubble → custom prompt (`ai-pop`) → before/after `ai-diff`.
- Replace / Insert below / Discard; loading + error states.
- **Done when:** selecting a paragraph and choosing "Improve" returns a real rewrite and applies on Replace.

### M5 — Settings  *(configuration)*
- `settings.go`: load/save, masked API key (local only).
- Settings dialog: API tab (with Test connection) + Appearance tab (all live-preview controls).
- Appearance changes drive the editor's reading view.
- **Done when:** configure API + appearance, persist across restart, AI uses saved config.

### M6 — Layout variants & About  *(polish)*
- View menu switches Classic / Three-pane / Focus.
- Three-pane rail+list; Focus hides sidebar/menu and applies reading width/tint.
- About dialog.
- **Done when:** all three layouts work and switch cleanly; About opens.

### M7 — RTL, a11y & build hardening  *(ship readiness)*
- Verify RTL mirroring everywhere except title bar.
- Keyboard nav, focus rings, `aria-pressed`/labels on toggles & tabs.
- `wails build` produces a clean Windows binary; smoke-test core loop.
- **Done when:** full RTL pass, no console errors, release build runs.

---

## 9. Acceptance criteria (v1 release)

- [ ] App launches to a dark-themed window with orange accent by default.
- [ ] Create, edit, organize (folders), search, and persist notes locally.
- [ ] Edit ↔ Preview toggle renders Markdown faithfully and theme-aware.
- [ ] Select text → AI bubble → prompt → diff → Replace/Insert/Discard, wired to a real API.
- [ ] Settings: API config (with Test connection) + full Appearance controls, all persisted & live.
- [ ] About dialog present.
- [ ] Light/Dark, 6 accent options, and LTR/RTL all work; title bar never mirrors.
- [ ] Three layouts (Classic / Three-pane / Focus) selectable.
- [ ] No console errors; `wails build` succeeds on Windows.

---

## 10. Open questions / risks

- **AI streaming:** Settings exposes a "Stream responses" toggle. v1 may ship
  non-streaming `TweakText` and add streaming via Wails events later.
- **Markdown scope:** GFM (tables, task lists)? Default to CommonMark + GFM via `marked`.
- **Selection mapping in preview:** AI tweak is simplest in Edit mode (textarea selection);
  decide whether to also support selecting inside rendered Preview.
- **Key security:** local JSON is convenient but unencrypted; consider OS keychain later.
- **Focus-mode entry/exit:** confirm keyboard shortcut and how to restore chrome.
```
