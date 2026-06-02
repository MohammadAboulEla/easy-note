// Presentational AI tweak overlay. The Editor owns the state machine and text
// replacement; this renders the right surface for each phase, positioned at
// (x, y) relative to the editor area.

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
  onQuick: (action: string) => void;
  onAsk: () => void;
  onPromptChange: (v: string) => void;
  onRunPrompt: () => void;
  onChip: (action: string, prompt?: string) => void;
  onReplace: () => void;
  onInsert: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}

const CHIPS: { label: string; action: string; prompt?: string }[] = [
  { label: 'Improve writing', action: 'improve' },
  { label: 'Summarize', action: 'summarize' },
  { label: 'Make formal', action: 'formal' },
  { label: 'Translate', action: '', prompt: 'Translate this text to English.' },
  { label: 'Fix grammar', action: 'grammar' },
];

export function AiOverlay(props: Props) {
  const { state } = props;
  if (state.phase === 'idle') return null;

  return (
    <div className="ai-layer" data-phase={state.phase} style={{ left: state.x, top: state.y }}>
      {state.phase === 'bubble' ? (
        <div className="bubble">
          <span className="ai-dot">✦</span>
          <button className="b accent" onClick={() => props.onQuick('improve')}>Improve</button>
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
            {CHIPS.map((c, i) => (
              <button
                key={c.label}
                className={`c${i === 0 ? ' accent' : ''}`}
                onClick={() => props.onChip(c.action, c.prompt)}
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
