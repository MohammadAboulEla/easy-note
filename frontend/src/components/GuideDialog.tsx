import { useEffect, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';

// A carousel tutorial teaching markdown. Each step shows the raw source next to
// its live-rendered result (rendered by the same Go engine the editor uses, so
// code steps are syntax-colored). Built on the AboutDialog overlay markup.

interface Step { title: string; instruction: string; md: string }

const STEPS: Step[] = [
  {
    title: 'Headings',
    instruction: 'Start a line with # signs. More #s mean a smaller heading.',
    md: '# Title\n## Section\n### Subsection',
  },
  {
    title: 'Emphasis',
    instruction: 'Wrap text in * for italic, ** for bold.',
    md: 'This is *italic*, this is **bold**, and this is ***both***.',
  },
  {
    title: 'Lists',
    instruction: 'Use - for bullets, or 1. for numbered lists. Press Enter to continue a list.',
    md: '- Apples\n- Oranges\n  - Clementines\n\n1. First\n2. Second',
  },
  {
    title: 'Task lists',
    instruction: 'Add [ ] or [x] after a bullet for checkboxes.',
    md: '- [x] Write the note\n- [ ] Review it\n- [ ] Share it',
  },
  {
    title: 'Links',
    instruction: 'Put the text in [ ] and the URL in ( ).',
    md: 'Visit the [Wails site](https://wails.io) to learn more.',
  },
  {
    title: 'Code',
    instruction: 'Use `backticks` for inline code, or three backticks for a fenced block with a language for coloring.',
    md: 'Inline `const x = 1`.\n\n```python\ndef greet(name):\n    return f"Hello, {name}!"\n```',
  },
  {
    title: 'Blockquotes',
    instruction: 'Begin a line with > to quote.',
    md: '> The palest ink is better than the best memory.',
  },
  {
    title: 'Tables',
    instruction: 'Use pipes and dashes to build a table.',
    md: '| Lang | Year |\n| ---- | ---- |\n| Go   | 2009 |\n| Rust | 2010 |',
  },
];

export function GuideDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [html, setHtml] = useState('');

  const prev = () => setStep(s => Math.max(0, s - 1));
  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    renderMarkdown(STEPS[step].md).then(h => { if (alive) setHtml(h); });
    return () => { alive = false; };
  }, [step]);

  const s = STEPS[step];

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="dlg guide-dlg" role="dialog" aria-modal="true" aria-label="Markdown Guide"
        onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-head">
          <h3>Markdown Guide</h3>
          <button className="x" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="guide">
          <div className="guide-step-head">
            <h4>{s.title}</h4>
            <p>{s.instruction}</p>
          </div>
          <div className="guide-cols">
            <pre className="guide-src">{s.md}</pre>
            <div className="real guide-rendered" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        <div className="dlg-foot guide-foot">
          <button className="ghost" onClick={prev} disabled={step === 0}>‹ Prev</button>
          <div className="guide-dots">
            {STEPS.map((st, i) => (
              <button
                key={st.title}
                className={`dot${i === step ? ' on' : ''}`}
                aria-label={`Step ${i + 1}: ${st.title}`}
                aria-current={i === step}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <button className="solid" onClick={next} disabled={step === STEPS.length - 1}>Next ›</button>
        </div>
      </div>
    </div>
  );
}
