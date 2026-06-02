import {
  forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import { InsertKind } from './MenuBar';
import { renderMarkdown } from '../lib/markdown';
import { EditorStats } from './StatusBar';
import { AiOverlay, AiState } from './AiOverlay';
import { TweakText } from '../../wailsjs/go/main/App';

export interface EditorHandle {
  format: (kind: InsertKind) => void;
}

interface Props {
  noteId: string;
  body: string;
  onChange: (body: string) => void;
  onStats: (stats: EditorStats) => void;
  forceView?: ViewMode;
}

type ViewMode = 'edit' | 'preview';

const IDLE_AI: AiState = {
  phase: 'idle', x: 0, y: 0, sel: { start: 0, end: 0, text: '' }, prompt: '', result: '', error: '',
};

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
function lineCol(text: string, pos: number): { ln: number; col: number } {
  const upto = text.slice(0, pos);
  const nl = upto.lastIndexOf('\n');
  return { ln: (upto.match(/\n/g)?.length ?? 0) + 1, col: pos - nl };
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

const WRAP: Partial<Record<InsertKind, [string, string]>> = {
  bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], link: ['[', '](https://)'],
};
const PREFIX: Partial<Record<InsertKind, string>> = {
  h1: '# ', h2: '## ', quote: '> ', list: '- ',
};

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { noteId, body, onChange, onStats, forceView }, ref,
) {
  const [view, setView] = useState<ViewMode>('edit');
  const [html, setHtml] = useState('');
  const [ai, setAi] = useState<AiState>(IDLE_AI);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);

  const effectiveView = forceView ?? view;

  useEffect(() => { setView('edit'); setAi(IDLE_AI); }, [noteId]);
  useEffect(() => { if (effectiveView !== 'edit') setAi(IDLE_AI); }, [effectiveView]);

  useEffect(() => {
    onStats({ words: countWords(body), ...cursor() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, noteId]);

  useEffect(() => {
    if (effectiveView !== 'preview') return;
    let alive = true;
    renderMarkdown(body).then(h => { if (alive) setHtml(h); });
    return () => { alive = false; };
  }, [effectiveView, body]);

  useLayoutEffect(() => {
    if (pendingSel.current && taRef.current) {
      const [s, e] = pendingSel.current;
      taRef.current.focus();
      taRef.current.setSelectionRange(s, e);
      pendingSel.current = null;
    }
  }, [body]);

  function cursor(): { ln: number; col: number } {
    return lineCol(body, taRef.current?.selectionStart ?? 0);
  }
  const report = () => onStats({ words: countWords(body), ...cursor() });

  // ---- formatting ----
  function applyWrap(before: string, after: string) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    onChange(body.slice(0, s) + before + body.slice(s, e) + after + body.slice(e));
    pendingSel.current = [s + before.length, e + before.length];
  }
  function applyPrefix(prefix: string) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart;
    const lineStart = body.lastIndexOf('\n', s - 1) + 1;
    onChange(body.slice(0, lineStart) + prefix + body.slice(lineStart));
    pendingSel.current = [s + prefix.length, s + prefix.length];
  }
  function format(kind: InsertKind) {
    if (effectiveView !== 'edit') setView('edit');
    const w = WRAP[kind]; if (w) return applyWrap(w[0], w[1]);
    const p = PREFIX[kind]; if (p) applyPrefix(p);
  }
  useImperativeHandle(ref, () => ({ format }));

  // ---- AI tweak ----
  function openBubble(e: React.MouseEvent<HTMLTextAreaElement>) {
    const ta = taRef.current, area = areaRef.current;
    if (!ta || !area) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (end <= start) return; // no selection
    const text = body.slice(start, end);
    const r = area.getBoundingClientRect();
    setAi({
      ...IDLE_AI, phase: 'bubble',
      x: clamp(e.clientX - r.left, 130, r.width - 130),
      y: clamp(e.clientY - r.top, 56, r.height - 20),
      sel: { start, end, text },
    });
  }

  async function runTweak(action: string, prompt = '') {
    setAi(s => ({ ...s, phase: 'loading' }));
    try {
      const result = await TweakText({ action, prompt, text: ai.sel.text } as any);
      setAi(s => ({ ...s, phase: 'diff', result }));
    } catch (err: any) {
      setAi(s => ({ ...s, phase: 'error', error: String(err?.message ?? err) }));
    }
  }

  function replaceWith(text: string, insertBelow: boolean) {
    const { start, end } = ai.sel;
    const next = insertBelow
      ? body.slice(0, end) + '\n\n' + text + body.slice(end)
      : body.slice(0, start) + text + body.slice(end);
    onChange(next);
    pendingSel.current = insertBelow
      ? [end + 2, end + 2 + text.length]
      : [start, start + text.length];
    setAi(IDLE_AI);
  }

  // ---- render ----
  const fb = (kind: InsertKind, label: React.ReactNode, title: string) => (
    <button className="fb" title={title} onClick={() => format(kind)}>{label}</button>
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setAi(IDLE_AI); return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); format('bold'); }
    else if (k === 'i') { e.preventDefault(); format('italic'); }
    else if (k === 'k') { e.preventDefault(); format('link'); }
  };

  return (
    <div className="editor">
      <div className="fmtbar">
        {fb('bold', <b>B</b>, 'Bold')}
        {fb('italic', <i>I</i>, 'Italic')}
        {fb('h1', 'H', 'Heading')}
        {fb('quote', '“”', 'Quote')}
        {fb('code', '</>', 'Code')}
        {fb('list', '≡', 'List')}
        <span className="sp" />
        {forceView ? null : (
          <div className="seg-sm" role="group" aria-label="View mode">
            <button className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}>Edit</button>
            <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>Preview</button>
          </div>
        )}
      </div>

      {effectiveView === 'edit' ? (
        <div className="editor-area" ref={areaRef}>
          <textarea
            ref={taRef}
            className="md-input"
            value={body}
            placeholder="Start writing… select a paragraph to tweak it with AI."
            spellCheck
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onKeyUp={report}
            onClick={report}
            onSelect={report}
            onMouseDown={() => { if (ai.phase !== 'idle') setAi(IDLE_AI); }}
            onMouseUp={openBubble}
          />
          <AiOverlay
            state={ai}
            onQuick={action => runTweak(action)}
            onAsk={() => setAi(s => ({ ...s, phase: 'prompt' }))}
            onPromptChange={v => setAi(s => ({ ...s, prompt: v }))}
            onRunPrompt={() => runTweak('', ai.prompt)}
            onChip={(action, prompt) => runTweak(action, prompt)}
            onReplace={() => replaceWith(ai.result, false)}
            onInsert={() => replaceWith(ai.result, true)}
            onDiscard={() => setAi(IDLE_AI)}
            onRetry={() => runTweak('', ai.prompt)}
          />
        </div>
      ) : (
        <div className="preview">
          <div className="real" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
});
