// Markdown rendering is done in Go (goldmark + bluemonday + Chroma class-based
// highlighting) so notes render identically everywhere and code blocks get real
// coloring. This wraps the generated binding; each call is an IPC round-trip, so
// callers should debounce per-keystroke use (the Editor preview effect does).
import { RenderMarkdown } from '../../wailsjs/go/main/App';

/** Render markdown to sanitized HTML via the Go backend. */
export async function renderMarkdown(md: string): Promise<string> {
  try {
    return await RenderMarkdown(md);
  } catch {
    return '';
  }
}
