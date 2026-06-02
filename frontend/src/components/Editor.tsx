import {
  forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import { InsertKind } from './MenuBar';
import { renderMarkdown } from '../lib/markdown';
import { EditorStats } from './StatusBar';
import { AiOverlay, AiState } from './AiOverlay';
import { useHistory } from '../state/useHistory';
import { AiBehavior } from '../state/settings';
import { TweakText, CancelTweak } from '../../wailsjs/go/main/App';

export interface EditorHandle {
  format: (kind: InsertKind) => void;
  undo: () => void;
  redo: () => void;
}

interface Props {
  noteId: string;
  body: string;
  onChange: (body: string) => void;
  onStats: (stats: EditorStats) => void;
  focus?: boolean;
  behavior: AiBehavior;
}

// Backend preset action keys; anything else is sent as a free-text prompt.
const PRESET_ACTIONS = new Set(['improve', 'shorten', 'grammar', 'formal', 'summarize']);

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

// List-item marker at the start of a line: optional indent, a bullet or ordered
// marker, and an optional task-list checkbox.
const LIST_RE = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s+)?/;
const INDENT = '  ';

// True if `pos` sits inside an open fenced code block (odd number of ``` before it).
function insideFence(text: string, pos: number): boolean {
  const before = text.slice(0, pos);
  const fences = before.match(/^```/gm);
  return !!fences && fences.length % 2 === 1;
}

const WRAP: Partial<Record<InsertKind, [string, string]>> = {
  bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], link: ['[', '](https://)'],
};
const PREFIX: Partial<Record<InsertKind, string>> = {
  h1: '# ', h2: '## ', quote: '> ', list: '- ',
};

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { noteId, body, onChange, onStats, focus, behavior }, ref,
) {
  const [view, setView] = useState<ViewMode>('edit');
  const [html, setHtml] = useState('');
  const [ai, setAi] = useState<AiState>(IDLE_AI);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  const history = useHistory();
  const reqId = useRef(0);          // increments per tweak; identifies the request
  const activeReq = useRef<string>(''); // id of the request currently in flight

  const effectiveView = view;

  // Route every body mutation through here so the custom history stays in sync.
  // kind 'type' coalesces rapid typing; 'structural' pushes a discrete entry.
  function commit(next: string, sel: [number, number], kind: 'type' | 'structural') {
    onChange(next);
    pendingSel.current = sel;
    history.push({ body: next, sel }, kind);
  }

  function applySnapshot(snap: { body: string; sel: [number, number] } | null) {
    if (!snap) return;
    onChange(snap.body);
    pendingSel.current = snap.sel;
  }
  const doUndo = () => applySnapshot(history.undo());
  const doRedo = () => applySnapshot(history.redo());

  useEffect(() => {
    setView('edit'); setAi(IDLE_AI);
    history.reset(body, [body.length, body.length]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);
  useEffect(() => { if (effectiveView !== 'edit') setAi(IDLE_AI); }, [effectiveView]);

  useEffect(() => {
    onStats({ words: countWords(body), ...cursor() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, noteId]);

  useEffect(() => {
    if (effectiveView !== 'preview') return;
    let alive = true;
    // Each render is now an IPC round-trip — debounce per-keystroke calls.
    const t = window.setTimeout(() => {
      renderMarkdown(body).then(h => { if (alive) setHtml(h); });
    }, 120);
    return () => { alive = false; window.clearTimeout(t); };
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
    commit(
      body.slice(0, s) + before + body.slice(s, e) + after + body.slice(e),
      [s + before.length, e + before.length],
      'structural',
    );
  }
  function applyPrefix(prefix: string) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart;
    const lineStart = body.lastIndexOf('\n', s - 1) + 1;
    commit(
      body.slice(0, lineStart) + prefix + body.slice(lineStart),
      [s + prefix.length, s + prefix.length],
      'structural',
    );
  }
  function format(kind: InsertKind) {
    if (effectiveView !== 'edit') setView('edit');
    const w = WRAP[kind]; if (w) return applyWrap(w[0], w[1]);
    const p = PREFIX[kind]; if (p) applyPrefix(p);
  }
  useImperativeHandle(ref, () => ({ format, undo: doUndo, redo: doRedo }));

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
    const id = `tweak-${++reqId.current}`;
    activeReq.current = id;
    setAi(s => ({ ...s, phase: 'loading' }));
    try {
      const result = await TweakText({
        id, action, prompt, text: ai.sel.text,
        systemPrompt: behavior.systemPrompt,
        tone: behavior.tone,
        language: behavior.language,
        verbosity: behavior.verbosity,
        temperature: behavior.temperature,
        preserveMarkdown: behavior.preserveMarkdown,
      } as any);
      if (activeReq.current !== id) return; // superseded or canceled
      setAi(s => ({ ...s, phase: 'diff', result }));
    } catch (err: any) {
      // If the user canceled (cleared the active request), swallow the error.
      if (activeReq.current !== id) return;
      setAi(s => ({ ...s, phase: 'error', error: String(err?.message ?? err) }));
    }
  }

  // Run a custom command: a known preset goes through `action`, else `prompt`.
  function runInstruction(instruction: string) {
    if (PRESET_ACTIONS.has(instruction)) runTweak(instruction);
    else runTweak('', instruction);
  }

  function cancelTweak() {
    const id = activeReq.current;
    activeReq.current = ''; // mark canceled so the pending await is swallowed
    if (id) CancelTweak(id);
    setAi(IDLE_AI);
  }

  function replaceWith(text: string, insertBelow: boolean) {
    const { start, end } = ai.sel;
    const next = insertBelow
      ? body.slice(0, end) + '\n\n' + text + body.slice(end)
      : body.slice(0, start) + text + body.slice(end);
    const sel: [number, number] = insertBelow
      ? [end + 2, end + 2 + text.length]
      : [start, start + text.length];
    commit(next, sel, 'structural');
    setAi(IDLE_AI);
  }

  // ---- render ----
  const fb = (kind: InsertKind, label: React.ReactNode, title: string) => (
    <button className="fb" title={title} onClick={() => format(kind)}>{label}</button>
  );

  // Plain typing: record into history (coalesced), let React handle the value.
  const onType = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.target;
    history.push({ body: ta.value, sel: [ta.selectionStart, ta.selectionEnd] }, 'type');
    onChange(ta.value);
  };

  // Enter on a list item continues / exits the list. Returns true if handled.
  function handleEnter(): boolean {
    const ta = taRef.current; if (!ta) return false;
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (s !== e) return false;
    if (insideFence(body, s)) return false;
    const lineStart = body.lastIndexOf('\n', s - 1) + 1;
    const line = body.slice(lineStart, s);
    const m = LIST_RE.exec(line);
    if (!m) return false;

    const [, indent, marker, gap, task] = m;
    const contentAfterMarker = line.slice(m[0].length);
    // Empty item (marker only) → exit the list / outdent.
    if (contentAfterMarker.trim() === '') {
      const next = body.slice(0, lineStart) + body.slice(s);
      commit(next, [lineStart, lineStart], 'structural');
      return true;
    }
    // Continue the list.
    let nextMarker = marker;
    if (/^\d+\.$/.test(marker)) nextMarker = (parseInt(marker, 10) + 1) + '.';
    const taskPart = task ? '[ ] ' : '';
    const ins = '\n' + indent + nextMarker + gap + taskPart;
    const next = body.slice(0, s) + ins + body.slice(e);
    const caret = s + ins.length;
    commit(next, [caret, caret], 'structural');
    return true;
  }

  // Tab / Shift+Tab: indent or outdent. Handles single caret and multi-line selection.
  function handleTab(outdent: boolean): boolean {
    const ta = taRef.current; if (!ta) return false;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const firstLineStart = body.lastIndexOf('\n', s - 1) + 1;

    if (s === e && !outdent) {
      const line = body.slice(firstLineStart, s);
      // On a list line, indent the whole line; otherwise insert spaces at caret.
      if (LIST_RE.test(line)) {
        const next = body.slice(0, firstLineStart) + INDENT + body.slice(firstLineStart);
        commit(next, [s + INDENT.length, s + INDENT.length], 'structural');
      } else {
        const next = body.slice(0, s) + INDENT + body.slice(e);
        commit(next, [s + INDENT.length, s + INDENT.length], 'structural');
      }
      return true;
    }

    // Selection (or outdent): operate on every covered line.
    const regionEnd = e;
    const region = body.slice(firstLineStart, regionEnd);
    const lines = region.split('\n');
    let delta = 0, firstDelta = 0;
    const out = lines.map((ln, i) => {
      if (outdent) {
        const m = ln.match(/^( {1,2}|\t)/);
        if (m) {
          const removed = m[1].length;
          if (i === 0) firstDelta = -removed;
          delta -= removed;
          return ln.slice(removed);
        }
        return ln;
      }
      if (i === 0) firstDelta = INDENT.length;
      delta += INDENT.length;
      return INDENT + ln;
    });
    const next = body.slice(0, firstLineStart) + out.join('\n') + body.slice(regionEnd);
    commit(next, [Math.max(firstLineStart, s + firstDelta), e + delta], 'structural');
    return true;
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setAi(IDLE_AI); return; }

    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); return; }
      if (k === 'b') { e.preventDefault(); format('bold'); return; }
      if (k === 'i') { e.preventDefault(); format('italic'); return; }
      if (k === 'k') { e.preventDefault(); format('link'); return; }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (handleEnter()) e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      if (handleTab(e.shiftKey)) e.preventDefault();
      return;
    }
  };

  return (
    <div className={`editor${focus ? ' focus' : ''}`}>
      <div className="fmtbar">
        {fb('bold', <b>B</b>, 'Bold')}
        {fb('italic', <i>I</i>, 'Italic')}
        {fb('h1', 'H', 'Heading')}
        {fb('quote', '“”', 'Quote')}
        {fb('code', '</>', 'Code')}
        {fb('list', '≡', 'List')}
        <span className="sp" />
        <div className="seg-sm" role="group" aria-label="View mode">
          <button className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}>Edit</button>
          <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>Preview</button>
        </div>
      </div>

      {effectiveView === 'edit' ? (
        <div className="editor-area" ref={areaRef}>
          <textarea
            ref={taRef}
            className="md-input"
            value={body}
            placeholder="Start writing… select a paragraph to tweak it with AI."
            spellCheck
            onChange={onType}
            onKeyDown={onKeyDown}
            onKeyUp={report}
            onClick={report}
            onSelect={report}
            onMouseDown={() => { if (ai.phase !== 'idle') setAi(IDLE_AI); }}
            onMouseUp={openBubble}
          />
          <AiOverlay
            state={ai}
            commands={behavior.commands}
            onQuick={action => runTweak(action)}
            onAsk={() => setAi(s => ({ ...s, phase: 'prompt' }))}
            onPromptChange={v => setAi(s => ({ ...s, prompt: v }))}
            onRunPrompt={() => runTweak('', ai.prompt)}
            onCommand={instruction => runInstruction(instruction)}
            onReplace={() => replaceWith(ai.result, false)}
            onInsert={() => replaceWith(ai.result, true)}
            onDiscard={() => setAi(IDLE_AI)}
            onCancel={cancelTweak}
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
