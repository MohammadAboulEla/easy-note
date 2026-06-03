import {
  cloneElement, isValidElement, ReactElement, useCallback, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';

interface Props {
  tip?: string;            // tooltip text; nothing shows when empty
  children: ReactElement;  // a single element anchor (handlers are attached to it)
  delay?: number;          // hover delay in ms before showing
}

interface Pos { left: number; top: number; arrow: number }

const GAP = 8;     // space between anchor and bubble
const MARGIN = 6;  // min distance from the viewport edge

// App-styled tooltip. Clones its single child and attaches hover handlers to it
// directly (no wrapper element), so it never alters flex/grid layout. The bubble
// is portaled into document.body to escape any overflow:auto/hidden ancestor
// (e.g. the scrolling sidebar) and is clamped to the viewport so long text never
// runs off-screen. Styling lives in app.css (.tooltip-bubble).
export function Tooltip({ tip, children, delay = 350 }: Props) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  // Position below the anchor, centered, then clamp horizontally; the arrow
  // tracks the anchor center even after clamping.
  const place = useCallback(() => {
    const anchor = anchorRef.current, bubble = bubbleRef.current;
    if (!anchor || !bubble) return;
    const a = anchor.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const center = a.left + a.width / 2;
    let left = center - b.width / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - b.width - MARGIN));
    setPos({ left, top: a.bottom + GAP, arrow: center - left });
  }, []);

  const show = () => {
    if (!tip) return;
    timer.current = window.setTimeout(() => {
      setPos({ left: -9999, top: -9999, arrow: 0 }); // mount off-screen, then measure
      requestAnimationFrame(place);
    }, delay);
  };
  const hide = () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    setPos(null);
  };

  if (!isValidElement(children)) return children;

  // Merge our handlers/ref with any the child already has.
  const childProps = children.props as any;
  const merged: any = {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const r = (children as any).ref;
      if (typeof r === 'function') r(node);
      else if (r) r.current = node;
    },
    onMouseEnter: (e: any) => { childProps.onMouseEnter?.(e); show(); },
    onMouseLeave: (e: any) => { childProps.onMouseLeave?.(e); hide(); },
    onMouseDown: (e: any) => { childProps.onMouseDown?.(e); hide(); },
  };

  return (
    <>
      {cloneElement(children as ReactElement<any>, merged)}
      {tip && pos
        ? createPortal(
            <div
              ref={bubbleRef}
              className="tooltip-bubble"
              style={{ left: pos.left, top: pos.top, ['--tip-arrow' as any]: `${pos.arrow}px` }}
              role="tooltip"
            >
              {tip}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
