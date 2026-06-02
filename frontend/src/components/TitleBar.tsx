import { Quit, WindowMinimise, WindowToggleMaximise } from '../../wailsjs/runtime/runtime';

// Custom title bar for the frameless window. Stays LTR in every direction mode
// (the `.titlebar` rule pins `direction: ltr`). The bar itself is draggable;
// the window controls opt out of dragging via `.no-drag`.
export function TitleBar({ title }: { title: string }) {
  return (
    <div className="titlebar drag">
      <span className="appicon" />
      <span className="title">{title}</span>
      <span className="wctrl no-drag">
        <button className="wc" aria-label="Minimize" onClick={() => WindowMinimise()}>—</button>
        <button className="wc" aria-label="Maximize" onClick={() => WindowToggleMaximise()}>▢</button>
        <button className="wc x" aria-label="Close" onClick={() => Quit()}>✕</button>
      </span>
    </div>
  );
}
