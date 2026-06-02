// Lazy markdown renderer. marked + dompurify are dynamically imported on first
// use so they stay out of the initial bundle (per the perf guidelines).
type Renderer = (md: string) => string;

let renderer: Renderer | null = null;
let loading: Promise<Renderer> | null = null;

async function load(): Promise<Renderer> {
  const [{ marked }, dompurify] = await Promise.all([
    import('marked'),
    import('dompurify'),
  ]);
  const DOMPurify = dompurify.default;
  marked.setOptions({ gfm: true, breaks: true });
  renderer = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
  return renderer;
}

/** Render markdown to sanitized HTML. Resolves once the libs have loaded. */
export async function renderMarkdown(md: string): Promise<string> {
  if (renderer) return renderer(md);
  if (!loading) loading = load();
  const r = await loading;
  return r(md);
}
