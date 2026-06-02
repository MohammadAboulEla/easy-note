// Presentational AI tweak overlay. The Editor owns the state machine and text
// replacement; this renders the right surface for each phase, positioned at
// (x, y) relative to the editor area.

import { useEffect } from 'react';
import { AiCommand } from '../state/settings';

export type AiPhase = 'idle' | 'bubble' | 'prompt' | 'loading' | 'diff' | 'error';

export interface AiState {
  phase: AiPhase;
  x: number;
  y: number;
  sel: { start: number; end: number; text: string };
  prompt: string;
  result: string;
  error: string;
}

interface Props {
  state: AiState;
  commands: AiCommand[];
  onQuick: (action: string) => void;
  onAsk: () => void;
  onPromptChange: (v: string) => void;
  onRunPrompt: () => void;
  onCommand: (instruction: string) => void;
  onReplace: () => void;
  onInsert: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

export function AiOverlay(props: Props) {
  const { state, commands } = props;

  // While the request is in flight, Esc cancels it.
  const loading = state.phase === 'loading';
  const { onCancel } = props;
  useEffect(() => {
    if (!loading) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [loading, onCancel]);

  if (state.phase === 'idle') return null;

  // The first command drives the bubble's accent quick-action; the rest stay as
  // the standard quick buttons / chips.
  const primary = commands[0];

  return (
    <div className="ai-layer" data-phase={state.phase} style={{ left: state.x, top: state.y }}>
      {state.phase === 'bubble' ? (
        <div className="bubble">
          <span className="ai-dot">✦</span>
          {primary ? (
            <button className="b accent" onClick={() => props.onCommand(primary.instruction)}>{primary.label}</button>
          ) : (
            <button className="b accent" onClick={() => props.onQuick('improve')}>Improve</button>
          )}
          <span className="div" />
          <button className="b" onClick={() => props.onQuick('shorten')}>Shorten</button>
          <button className="b" onClick={() => props.onQuick('grammar')}>Fix grammar</button>
          <span className="div" />
          <button className="b" onClick={props.onAsk}>Ask…</button>
        </div>
      ) : null}

      {state.phase === 'prompt' ? (
        <div className="ai-pop">
          <div className="row1"><span className="ai-dot">✦</span><b>Tweak with AI</b></div>
          <input
            className="prompt-input"
            autoFocus
            placeholder="Make it concise and professional…"
            value={state.prompt}
            onChange={e => props.onPromptChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') props.onRunPrompt(); }}
          />
          <div className="chips">
            {commands.map((c, i) => (
              <button
                key={c.id}
                className={`c${i === 0 ? ' accent' : ''}`}
                onClick={() => props.onCommand(c.instruction)}
              >{c.label}</button>
            ))}
          </div>
          <div className="actions">
            <button className="ok" onClick={props.onRunPrompt}>Run</button>
            <button className="no" onClick={props.onDiscard}>Cancel</button>
          </div>
        </div>
      ) : null}

      {state.phase === 'loading' ? (
        <div className="ai-pop">
          <div className="row1"><span className="ai-dot">✦</span><b>Thinking…</b></div>
          <div className="ai-spinner"><span /><span /><span /></div>
          <div className="actions">
            <button className="no" onClick={props.onCancel}>Cancel</button>
          </div>
        </div>
      ) : null}

      {state.phase === 'diff' ? (
        <div className="ai-pop wide">
          <div className="row1"><span className="ai-dot">✦</span><b>Suggested edit</b></div>
          <div className="ai-diff">
            <span className="old">{state.sel.text}</span>
            <span className="new">{state.result}</span>
          </div>
          <div className="actions">
            <button className="ok" onClick={props.onReplace}>✓ Replace</button>
            <button className="no" onClick={props.onInsert}>Insert below</button>
            <button className="no" onClick={props.onDiscard}>Discard</button>
          </div>
        </div>
      ) : null}

      {state.phase === 'error' ? (
        <div className="ai-pop">
          <div className="row1"><span className="ai-dot err">!</span><b>AI request failed</b></div>
          <div className="ai-err">{state.error}</div>
          <div className="actions">
            <button className="ok" onClick={props.onRetry}>Retry</button>
            <button className="no" onClick={props.onDiscard}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
