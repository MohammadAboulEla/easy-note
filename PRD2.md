# EasyNote — PRD2 (Enhancements Round)

> Companion to `PRD.md`. PRD.md describes the shipped v1 (M0–M7). **PRD2 is the
> next round of enhancements.** Read this top-to-bottom; you should not need to
> re-derive the architecture from scratch — the orientation below plus the file
> map gets you straight to work.

- **Status:** Ready to implement
- **Last updated:** 2026-06-02
- **Base:** working M6/M7 build of the `memo` Wails app (EasyNote)

---

## 0. Orientation — how this app is built (read first)

**Stack:** Wails v2 — Go backend + React 18 / TypeScript / Vite frontend. Frameless
window; a custom in-app title bar (always LTR) replaces the OS chrome.

**Run / build:**
- Dev (hot reload): `wails dev` from the repo root (`d:\programing\Go\memo`).
- Build: `wails build` → `EasyNote.exe`. Frontend alone: `cd frontend && npm run build`.
- After changing any Go method bound on `App`, Wails **regenerates** the JS bindings in
  `frontend/wailsjs/go/main/App.*` on the next `wails dev`/`wails build`. Import bound
  methods from `../../wailsjs/go/main/App`.

**Go backend (package `main`, repo root):**
- `main.go` — Wails bootstrap; frameless window; binds the single `App` struct.
- `app.go` — `App` struct (`ctx`, `mu sync.Mutex`, `dataDir`, `ws`, `settings`) + `startup`.
  **Everything bound to the frontend is a method on `App`.**
- `notes.go` — Note/Folder model + JSON store + CRUD bindings.
- `settings.go` — `Settings` struct + load/save (JSON under the OS config dir, e.g.
  `%APPDATA%/EasyNote`). **The Go `Settings` shape is the source of truth and must stay
  in sync with the TS `Settings` interface** — if you add fields in TS settings, add the
  matching Go struct fields here or they won't persist.
- `ai.go` — OpenAI-compatible client. `TweakText(TweakRequest) (string, error)` and
  `TestConnection`. System prompt + `temperature: 0.4` are currently **hardcoded**
  (`ai.go:48–66` action presets, `:135` temperature, `:187` system prompt). Uses the
  app-level `a.ctx` (not cancelable per-request yet).

**Frontend (`frontend/src/`):**
- `App.tsx` — shell + the 3 layout modes (`classic` / `three-pane` / `focus`); a `modal`
  state drives Settings/About dialogs; global keyboard shortcuts (`Ctrl+S/N/\`).
- `state/`
  - `settings.ts` — `Settings`/`Appearance` interfaces, `DEFAULT_SETTINGS`,
    `applySettings()` which writes CSS custom properties + `data-theme`/`dir` onto
    `<html>`. **This is where appearance tokens get reflected to CSS.**
  - `useSettings.ts` — `SettingsApi` hook: loads from Go (`GetSettings`), debounced save
    (`SaveSettings`), and helpers `setTheme/setAccent/patchAppearance/patchApi`.
  - `useWorkspace.ts` — notes/folders state + the active note.
- `components/`
  - `TitleBar.tsx`, `MenuBar.tsx` (File/Edit/View/Insert/Help), `StatusBar.tsx`.
  - `Sidebar.tsx` (classic), `RailList.tsx` (three-pane), `Editor.tsx`, `AiOverlay.tsx`,
    `SettingsDialog.tsx` (tabs: API/Appearance/Editor/Shortcuts), `AboutDialog.tsx`.
  - `Editor.tsx` is a **plain `<textarea>`** (`.md-input`); it holds the AI tweak flow
    (`runTweak`, `replaceWith`), formatting (`applyWrap`/`applyPrefix`), and the
    `onKeyDown` shortcut handler. Caret/selection after a programmatic write is restored
    via `pendingSel.current` + a `useLayoutEffect` keyed on `body`.
  - `lib/markdown.ts` — `renderMarkdown(md): Promise<string>` using **marked + DOMPurify**
    (lazy-imported). Preview calls it in an effect with an `alive` cleanup flag.
- `styles/theme.css` — design tokens (light/dark palettes, font stacks, the `--reading-*`
  custom properties) + the app grid. `styles/app.css` — component styles.

**House rules (enforced — see `PRD.md §7.1` and the repo skills in `.agents/skills/`):**
- **CSS:** drive *everything* through global CSS custom properties on `:root`/`[data-theme]`;
  reference `var(--token)`; keep CSS plain and hand-editable in `theme.css`/`app.css`.
  **No CSS-in-JS, no generated/obfuscated styles.** (User hand-edits CSS often.)
- **React perf:** don't define components inside components (causes editor remount/focus
  loss); derive state in render over `useEffect`+`setState`; lazy-`import()` heavy deps;
  guard `localStorage` in try/catch (Go is the source of truth).
- **Aesthetic:** refined-minimal; keep Atkinson Hyperlegible + Caveat fonts; calm
  greyscale + one accent.
- The in-app **title bar / menubar are always LTR** even in RTL mode.

**Conventions for these features:**
- A new modal → add a value to `App.tsx`'s `modal` union and render it like
  `SettingsDialog`/`AboutDialog`; reuse `AboutDialog.tsx`'s overlay markup/classes.
- A new persisted setting → add to TS `Appearance`/`Settings` **and** the Go `Settings`
  struct in `settings.go`, plus a `patch*` helper in `useSettings.ts`, plus a token in
  `applySettings()` if it drives CSS.
- A new bound Go method → add it to `App`, run `wails dev` to regenerate bindings, import
  from `../../wailsjs/go/main/App`.

---

## Scope of PRD2

1. Obsidian-like writing experience (list continuation, Tab indent, smart Enter).
2. Server-side markdown engine (goldmark) + syntax highlighting for all common languages.
3. Reading-area **text color** control (+ existing page background).
4. Sidebar collapse buttons (classic + three-pane).
5. Fix focus mode (make it editable; remove dead space).
6. Undo / redo system.
7. Help → Markdown guide (carousel tutorial modal).
8. Cancel / interrupt the AI mid-request (true backend cancellation).
9. Settings → AI tab (tweak AI behavior + custom instructions).

Implement features independently; each section below lists exact files, the reason, and
acceptance criteria. A full file map and a verification checklist are at the end.

---

## 1. Better writing experience (Obsidian-like)

**File:** `frontend/src/components/Editor.tsx` — extend the `onKeyDown` handler
(currently lines ~151–158, formatting shortcuts only) on the `.md-input` textarea.

Add smart editing in the textarea (all using `e.preventDefault()` + a single
`onChange(newBody)` write, restoring caret via the existing `pendingSel.current`
pattern used by `applyWrap`/`applyPrefix`):

- **Enter on a list item → continue the list.** Detect the current line with
  `body.lastIndexOf('\n', caret-1)+1`. Match `^(\s*)([-*+] |\d+\. )(\[[ x]\] )?`:
  - If the item has content → insert `\n` + same indent + same marker (ordered
    markers increment the number; task-list `- [ ]` continues unchecked).
  - If the item is empty (just the marker) → remove the marker (outdent/exit list).
- **Tab / Shift+Tab → indent / outdent.** With no selection on a list line, add or
  remove one indent unit (2 spaces) at line start; otherwise insert 2 spaces at
  caret. With a multi-line selection, indent/outdent every covered line.
- **Enter inside a fenced code block → no list logic, plain newline** (detect odd
  count of ```` ``` ```` fences before the caret to avoid mangling code).
- **Auto-pair (optional, low-risk)**: wrap selection when typing `*`, `` ` ``,
  `[`, `(` over a non-empty selection — reuses `applyWrap`.

Keep changes confined to the keydown handler + small pure helpers near the existing
`applyWrap`/`applyPrefix` functions. No new dependencies.

---

## 2. Professional markdown engine + syntax highlighting (Go backend)

Move rendering off the frontend into Go so notes render identically everywhere and
code blocks get real coloring.

**Go side — new file `markdown.go`** (package `main`), plus a Wails binding:

```bash
go get github.com/yuin/goldmark
go get github.com/yuin/goldmark/extension
go get github.com/yuin/goldmark-highlighting/v2
go get github.com/microcosm-cc/bluemonday
```

- Build a package-level `goldmark.Markdown` once (goroutine-safe to reuse):
  - `extension.GFM` (tables, task lists, strikethrough, autolinks).
  - `highlighting.NewHighlighting(...)` with a Chroma style and
    `highlighting.WithFormatOptions(chromahtml.WithClasses(true))` so colors come
    from a CSS class theme (lets light/dark follow the app theme). Chroma
    auto-detects **all common languages** (python, go, js, ts, rust, json, bash,
    sql, html, css, …) — not just python.
  - `parser.WithAutoHeadingID()`, `html.WithHardWraps()` to match current
    `breaks: true` behavior.
- Sanitize output with a tuned `bluemonday` policy: start from `UGCPolicy()` and
  **allow the class attribute on `code`/`span`/`pre`** (Chroma needs classes);
  allow heading IDs. Without this the highlight classes get stripped.
- Expose `func (a *App) RenderMarkdown(md string) (string, error)` on `App` (in
  `app.go` it's already the bound struct). Wails will regenerate
  `frontend/wailsjs/go/main/App.*` bindings.

**Frontend side — `frontend/src/lib/markdown.ts`:**
- Replace the `marked`/`dompurify` dynamic import with a call to the generated
  `RenderMarkdown` binding. Keep the same async `renderMarkdown(body): Promise<string>`
  signature so `Editor.tsx` (lines ~66–71) is unchanged.
- Debounce per-keystroke calls (~120ms) since each render is now an IPC round-trip;
  reuse the existing `alive` cleanup-flag pattern in the effect.
- Remove `marked` + `dompurify` from `frontend/package.json` dependencies.

**Styling — `frontend/src/styles/app.css`** (code-block block ~lines 462–470):
- Add a Chroma class-based color theme (`.chroma .k`, `.chroma .s`, `.chroma .c`,
  etc.) driven by CSS custom properties so it tracks light/dark. Define the token
  set once in `theme.css` next to the existing palettes.

**Acceptance:** the Python sample renders with keyword/string/builtin coloring; a
Go/JS/JSON block colors too; `<script>` in a note is stripped.

---

## 3. Appearance: reading-area background **and** font color

Add an ink-color control mirroring the existing "Page background" swatch row.

- **`frontend/src/state/settings.ts`**:
  - Add `inkColor: string` to `interface Appearance` (`''` = follow theme).
  - Add to `DEFAULT_SETTINGS.appearance` (`inkColor: ''`).
  - Add an `INK_COLORS` export (a few light + dark ink tints, paralleling `PAGE_BGS`).
  - In `applySettings`, set `--reading-ink` →
    `root.style.setProperty('--reading-ink', a.inkColor || 'var(--ink)')`.
  - **Also add `InkColor` to the Go `Settings`/appearance struct in `settings.go`** so it
    persists (and regenerate bindings).
- **`frontend/src/styles/theme.css` / `app.css`**: introduce `--reading-ink`
  (default `var(--ink)`) and apply it to the reading surfaces — `.md-input` color
  and `.real` color (preview). Today these inherit `--ink`; switch them to
  `--reading-ink`.
- **`frontend/src/components/SettingsDialog.tsx`** (Reading-area fieldset,
  ~lines 183–199): add a second swatch row "Text color" directly under "Page
  background", using the same `sw`/`sw auto` markup and an `INK_COLORS.map`, with
  the "A / Follow theme" auto chip calling `patchAppearance({ inkColor: '' })`.

---

## 4. Sidebar collapse buttons

**a) Classic mode — add a visible collapse toggle when expanded.**
- The collapsed sidebar already has a `☰` expand button (`Sidebar.tsx:35`). The
  **expanded** sidebar has no collapse affordance (only `Ctrl+\` and a menu item).
- Add an `onCollapse?: () => void` prop to `Sidebar` and render a small collapse
  button (`«` / `☰`) in the expanded sidebar header row, next to search/new.
- In `App.tsx` (~line 89) pass `onCollapse={() => setSidebarCollapsed(true)}`
  alongside the existing `collapsed` / `onExpand` props. `setSidebarCollapsed`
  state already exists (`App.tsx:22`).

**b) Three-pane mode — make the sidebar/rail collapsible** (original point 4).
- In `RailList` (`frontend/src/components/RailList.tsx`), add a collapse button at
  the top of the note-list column and support a collapsed state that hides the
  list column (keeping the icon rail), toggled by the button **and** the existing
  `Ctrl+\` shortcut. Reuse the `sidebarCollapsed` state in `App.tsx` so one shortcut
  serves both layouts; pass it down to `RailList`.

---

## 5. Fix focus mode

Root causes:
1. `App.tsx:49` passes `forceView={focusMode ? 'preview' : undefined}` → focus mode
   is **preview-only**, so the user genuinely cannot edit.
2. With `forceView` set, the Edit/Preview toggle is hidden (`Editor.tsx:170`), and
   the centered narrow `.real` (`max-width: var(--reading-width)`) over the full-width
   window leaves the wide empty side gutters / dead space the user describes.

Changes (decision: **editable, distraction-free**):
- **`App.tsx`**: stop forcing preview in focus mode — pass `forceView={undefined}`
  (or drop the prop) so the editor opens in its normal editable `edit` view. Focus
  mode keeps hiding the menubar/sidebar (already does, lines 63–74, 77–81).
- **`Editor.tsx`**: keep the minimal Edit/Preview segment available in focus mode so
  the writer can still flip to preview. (Since `forceView` is no longer set, the
  existing `{forceView ? null : <seg>}` already shows it — no change needed beyond
  step above. Optionally add a `focus` class for styling.)
- **`app.css` focus styling** (`.focus-exit` ~lines 421–428, `.editor-area`/`.md-input`
  ~199–224): ensure the editor fills the body. The app grid
  (`theme.css:84` `grid-template-rows: auto auto 1fr auto`) collapses the null
  menubar row to 0, so the "unused area under the status bar" is the editor not
  expanding — verify `.editor`/`.editor-area` keep `flex:1; min-height:0` in focus
  mode and that `.md-input` stretches full height. Confirm `.editor-area` background
  is `--reading-bg` edge-to-edge and the textarea height fills, removing any residual
  gap below the caret area.
- Confirm the status bar still shows "Focus mode" (`App.tsx:40`) and the `Exit focus`
  button remains reachable (`focus-exit`).

**Acceptance:** entering focus mode shows an editable, full-height writing surface
with no large empty band under the status bar; typing works; Exit returns to classic.

---

## 6. Undo / redo system

The native `<textarea>` has built-in undo/redo, but **every programmatic write breaks
it** — `applyWrap`/`applyPrefix`, the AI `replaceWith`, and the new list/Tab logic all
set value via React `onChange(newBody)`, which clears the browser's native undo stack.
So edits made with the toolbar, shortcuts, AI, or list-continuation cannot be undone.
A custom history is needed.

**File:** `frontend/src/components/Editor.tsx` (plus a small hook
`frontend/src/state/useHistory.ts`).

- Add a per-note history hook holding a stack of snapshots
  `{ body: string; sel: [number, number] }` with an index pointer and a redo tail.
  Reset/seed it on `noteId` change (there is already a `useEffect(... [noteId])` at
  line 58 to hook into).
- **Push policy (coalescing):** route all body mutations through one `commit(next, sel)`
  helper that calls the existing `onChange`. Coalesce rapid plain typing into a single
  history entry using a debounce/idle boundary (~400ms) or a "word boundary" rule
  (push a new entry on space/newline/punctuation), so undo steps back by words, not
  characters — Obsidian-like. Structural ops (format, list-continuation, Tab, AI
  replace) always push their own discrete entry immediately.
- **Undo/redo actions:** `Ctrl+Z` → pop to previous snapshot; `Ctrl+Shift+Z` **and**
  `Ctrl+Y` → redo. Wire into the existing `onKeyDown` handler (call
  `e.preventDefault()` so the now-stale native undo doesn't also fire). Restore both
  text and caret/selection via the existing `pendingSel.current` mechanism
  (lines 54, 73–80).
- Keep history **in-memory per session**; bound the stack (e.g. last ~200 entries) to
  cap memory. No backend/persistence change.
- Expose `undo`/`redo`/`canUndo`/`canRedo` via the editor ref so the **Edit menu**
  items can call them. Note the Edit menu currently wires Undo/Redo to
  `document.execCommand('undo'|'redo')` (`MenuBar.tsx:95–96`), which won't see our
  custom stack — rewire those to the new actions (e.g. via an `onUndo`/`onRedo` prop
  routed through `editorRef`).

**Acceptance:** type a sentence, bold a word, continue a list, run an AI tweak — then
`Ctrl+Z` reverses each step in order (typing coalesced into word-ish chunks), and
`Ctrl+Shift+Z`/`Ctrl+Y` reapplies. Switching notes starts a fresh history.

---

## 7. Help → Markdown guide (tutorial modal)

Add a **Guide** entry to the Help menu that opens a modal teaching markdown with
live examples — a carousel of simple steps for new users.

**Reuse the existing modal pattern**: `App.tsx` already has a `modal` state
(`'settings' | 'about' | null`, line 23) and renders `AboutDialog`/`SettingsDialog`
the same way (lines 97–98). `AboutDialog.tsx` is the template for a centered overlay
modal with a close button.

- **`frontend/src/components/MenuBar.tsx`** (Help menu, lines 146–148): add
  `<Item label="Markdown Guide" onClick={run(props.onGuide)} />` above About. Add an
  `onGuide: () => void` prop to `MenuBarProps`.
- **`frontend/src/App.tsx`**: extend the `modal` union to include `'guide'`, pass
  `onGuide={() => setModal('guide')}` to `MenuBar`, and render
  `{modal === 'guide' ? <GuideDialog onClose={() => setModal(null)} /> : null}`.
- **New `frontend/src/components/GuideDialog.tsx`**: a **carousel modal** built on the
  same overlay markup/classes as `AboutDialog`:
  - An array of steps, each with a title, short instruction, the raw markdown snippet,
    and its rendered result. Cover the essentials: headings, **bold**/*italic*, lists
    & task lists, links, `inline code`, fenced code blocks (show colored output —
    ties into §2 highlighting), blockquotes, and tables.
  - Render each step's "result" by calling the same `renderMarkdown` from
    `lib/markdown.ts` (so examples match real output, including syntax colors), with
    Prev / Next buttons, step dots, and an optional "Don't show on startup" affordance.
  - Keyboard: ←/→ to navigate, Esc to close (mirror `AboutDialog` close handling).
- **Styling — `frontend/src/styles/app.css`**: a `.guide` block reusing the existing
  modal/overlay tokens; a two-column "raw → rendered" layout per step and a dot/arrow
  carousel control. No new dependencies.

**Acceptance:** Help → Markdown Guide opens a modal; arrows/keys move through steps;
each step shows the markdown source next to its live-rendered result (code steps are
colored); Esc/close dismisses it.

---

## 8. Cancel / interrupt the AI while it's thinking

Today the AI "Thinking…" state (`AiOverlay.tsx:83–86`) has a spinner but **no way to
stop it**: `runTweak` (`Editor.tsx:124–132`) awaits `TweakText` with no abort, and the
Go side uses the app-level `a.ctx` (`ai.go:192`, `TweakText`) so the HTTP call can't be
canceled. Decision: **true backend cancellation**.

**Go side — `ai.go` + `app.go`:**
- Maintain a registry of in-flight tweaks on `App`: `inflight map[string]context.CancelFunc`
  guarded by the existing `a.mu` mutex (`app.go:12`). (Initialize the map in `NewApp`.)
- Change `TweakText` to accept/derive a **request ID** (add `ID string` to
  `TweakRequest`, set by the frontend). At the start, build
  `ctx, cancel := context.WithCancel(a.ctx)` (keep a sane upper-bound timeout too),
  register `inflight[id] = cancel`, and `defer` its removal + `cancel()`. Pass this
  `ctx` into `postChat` (already `ctx`-aware via `http.NewRequestWithContext`).
- Add a bound method `func (a *App) CancelTweak(id string)` that looks up and calls the
  stored `cancel()`. Wails regenerates `frontend/wailsjs/go/main/App.*`.
- A canceled `postChat` returns a context error → `TweakText` returns an error; the
  frontend treats a cancellation as a silent dismiss, not an error toast.

**Frontend — `Editor.tsx`:**
- Generate a request ID per tweak (e.g. a counter ref) and store it in AI state.
  In `runTweak`, pass the ID to `TweakText`; on the catch path, if the AI phase was
  reset to idle by the user (canceled), swallow the error instead of showing `error`.
- Add `cancelTweak()` that calls the generated `CancelTweak(id)` binding and resets
  `setAi(IDLE_AI)` immediately so the UI returns to normal at once.

**Frontend — `AiOverlay.tsx`:**
- In the `loading` phase block (lines 83–88), add a **Cancel** button (and allow `Esc`
  to trigger it) wired to a new `onCancel` prop, rendered next to "Thinking…".
- Thread `onCancel={cancelTweak}` from `Editor.tsx` where `AiOverlay` is rendered
  (lines 194–205).

**Acceptance:** trigger an AI tweak, and while "Thinking…" shows, click Cancel (or press
Esc) → the overlay closes instantly, no error appears, and the underlying HTTP request
is actually aborted (verifiable via server logs / dropped connection).

---

## 9. Settings → AI tab (tweak AI behavior + custom instructions)

Add a new **AI** tab to Settings letting the user shape how the assistant rewrites
selected text, so they get the best possible response. Today everything is hardcoded:
the system prompt, temperature `0.4`, and the preset actions live in `ai.go:48–66,187`,
and the overlay chips/quick-actions are hardcoded in `AiOverlay.tsx:30–36,47–52`.
The AI tab makes these user-configurable and reusable.

**Settings model — `frontend/src/state/settings.ts` (+ matching Go struct in `settings.go`):**
Add an `AiBehavior` interface to `Settings` (alongside `api`):
```ts
interface AiCommand { id: string; label: string; instruction: string }  // user presets
interface AiBehavior {
  systemPrompt: string;     // persona / global instruction prepended to every tweak
  tone: string;             // e.g. 'neutral' | 'professional' | 'friendly' | 'academic' | 'custom'
  language: string;         // '' = match source, or 'English', 'Arabic', …
  verbosity: string;        // 'concise' | 'balanced' | 'detailed'
  temperature: number;      // 0–1 creativity slider (replaces hardcoded 0.4)
  preserveMarkdown: boolean;// keep markdown structure of the selection
  commands: AiCommand[];    // custom reusable actions → surface as overlay chips
}
```
Provide `DEFAULT_AI_BEHAVIOR` (sensible defaults + a couple of seed `commands` matching
today's chips so behavior is unchanged out of the box). These persist via the existing
Wails settings round-trip — **add the corresponding fields to the Go `Settings` struct in
`settings.go`** so they survive a restart.

**Settings UI — `frontend/src/components/SettingsDialog.tsx`:**
- Add `'ai'` to the `Tab` union (line 8) and the tab list (line 73), labeled "AI".
- New tab body with grouped fields (reusing existing `field`/`fieldset`/`slider`/
  `input` markup):
  - **System instruction** — a `<textarea>` for a persona/global instruction
    ("You are my editor; keep my voice; prefer plain English…"). This is the single
    biggest lever on response quality.
  - **Default tone** + **Output language** (selects) + **Verbosity** (segmented).
  - **Creativity (temperature)** — `slider(0, 1, 0.05)`.
  - **Preserve markdown** — a toggle.
  - **Custom commands editor** — add/edit/delete rows of `{label, instruction}`. These
    become one-click chips in the AI overlay. Include a short hint that the selected
    text is the thing being rewritten. A "Restore defaults" button reseeds
    `DEFAULT_AI_BEHAVIOR.commands`.
  - A small **live preview** of the effective system message assembled from the knobs
    (optional but very helpful for "maximum best response" tuning).
- Add `patchAi`/`setAiBehavior` to `SettingsApi` (`useSettings.ts`) mirroring the
  existing `patchApi`/`patchAppearance` helpers.

**Overlay wiring — `frontend/src/components/AiOverlay.tsx` + `Editor.tsx`:**
- Replace the hardcoded `CHIPS` array with the user's `behavior.commands` (passed in as
  a prop from `Editor.tsx`). The first command renders as the accent chip. Quick-actions
  in the `bubble` can also be driven by the first few commands.
- `runTweak` (`Editor.tsx:124`) sends the behavior knobs alongside the request so the
  backend can compose the final prompt.

**Backend — `ai.go`:**
- Extend `TweakRequest` with the behavior fields (system prompt, tone, language,
  verbosity, temperature, preserveMarkdown) — or read them server-side from saved
  settings if simpler. In `TweakText` (line 173), compose the system message from the
  user's `systemPrompt` + tone/language/verbosity/preserve-markdown directives instead
  of the fixed string (line 187), and use the user's `temperature` in `chatRequest`
  (replace the literal `0.4` at line 135 / pass it through `postChat`).
- Keep a safe fallback: if `systemPrompt` is empty, use today's default so nothing
  breaks. Custom-command instructions flow through the existing
  `actionInstruction(action, prompt)` path (a custom command is just a saved `prompt`).

**Acceptance:** Settings → AI lets the user set a persona, tone, language, verbosity,
and creativity, and define custom commands; those commands appear as chips in the
"Tweak with AI" overlay; running a tweak honors the system instruction and temperature
(verifiably different output vs. defaults); empty settings behave exactly as today.

---

## Files touched (summary)

| Area | Files |
|------|-------|
| Writing UX | `frontend/src/components/Editor.tsx` |
| Markdown engine | new `markdown.go`; `app.go`; `go.mod`/`go.sum`; `frontend/src/lib/markdown.ts`; `frontend/package.json`; generated `frontend/wailsjs/go/main/App.*` |
| Code colors | `frontend/src/styles/theme.css`, `frontend/src/styles/app.css` |
| Appearance | `frontend/src/state/settings.ts`, `settings.go`, `frontend/src/components/SettingsDialog.tsx`, `theme.css`/`app.css` |
| Sidebar | `frontend/src/components/Sidebar.tsx`, `frontend/src/components/RailList.tsx`, `frontend/src/App.tsx` |
| Focus mode | `frontend/src/App.tsx`, `frontend/src/components/Editor.tsx`, `frontend/src/styles/app.css` |
| Undo/redo | new `frontend/src/state/useHistory.ts`; `frontend/src/components/Editor.tsx`; `frontend/src/components/MenuBar.tsx`; `frontend/src/App.tsx` |
| Markdown guide | new `frontend/src/components/GuideDialog.tsx`; `frontend/src/components/MenuBar.tsx`; `frontend/src/App.tsx`; `frontend/src/styles/app.css` |
| AI cancel | `ai.go`; `app.go`; generated `frontend/wailsjs/go/main/App.*`; `frontend/src/components/Editor.tsx`; `frontend/src/components/AiOverlay.tsx` |
| AI behavior tab | `frontend/src/state/settings.ts`; `settings.go`; `frontend/src/state/useSettings.ts`; `frontend/src/components/SettingsDialog.tsx`; `frontend/src/components/AiOverlay.tsx`; `frontend/src/components/Editor.tsx`; `ai.go` |

---

## Verification

1. `go mod tidy` then `wails dev` — confirms Go deps resolve and bindings regenerate.
2. **Markdown/highlight:** create a note with a Python sample plus Go/JSON/bash blocks,
   a table, and a task list; preview shows colored code, rendered table, and checkboxes.
   Paste `<script>alert(1)</script>` → it is stripped.
3. **Writing UX:** type `- a` Enter → new `- ` line; Enter on empty `- ` exits the
   list; Tab indents a list line; ordered list increments; Enter inside a ``` fence
   stays plain.
4. **Appearance:** Settings → Appearance → set a Text color tint and a Page background;
   both apply live to editor and preview; "Follow theme" reverts; survives restart.
5. **Sidebar:** classic mode — click the new collapse button → collapses; `☰`
   re-expands; `Ctrl+\` still works. Three-pane — list column collapses/expands via
   button and `Ctrl+\`.
6. **Focus mode:** switch layout to Focus → editable full-height surface, no dead band
   under status bar, typing works, `Exit focus` returns to classic.
7. **Undo/redo:** type → bold → continue a list → AI tweak; `Ctrl+Z` reverses each step
   (typing in word-ish chunks); `Ctrl+Shift+Z`/`Ctrl+Y` redoes; switching notes resets
   history; Edit-menu Undo/Redo drive the new history (not `execCommand`).
8. **Markdown guide:** Help → Markdown Guide opens the carousel modal; ←/→ navigate
   steps; each step shows raw markdown next to live-rendered output (code colored);
   Esc/close dismisses.
9. **AI cancel:** start a tweak; while "Thinking…", Cancel/Esc closes the overlay
   instantly with no error, and the backend HTTP request is actually aborted.
10. **AI tab:** Settings → AI — set a system instruction, tone, language, verbosity,
    creativity, and add a custom command; the command shows as a chip in the overlay
    and running it (and the built-in actions) reflects the new system prompt +
    temperature; survives restart; empty/default settings behave exactly as before.
11. Build: `wails build` succeeds with no `marked`/`dompurify` references remaining.
