import { Dir } from '../state/settings';

export interface EditorStats {
  words: number;
  ln: number;
  col: number;
}

interface Props {
  mode: string;          // e.g. "Markdown" or "Focus mode"
  stats: EditorStats;
  dir: Dir;
  saved?: boolean;
}

export function StatusBar({ mode, stats, dir, saved }: Props) {
  return (
    <div className="statusbar">
      <span className="sb-accent">● {mode}</span>
      <span>{stats.words} words</span>
      <span>Ln {stats.ln}, Col {stats.col}</span>
      <div className="right">
        {saved ? <span>Saved</span> : null}
        <span>UTF-8</span>
        <span>{dir.toUpperCase()}</span>
      </div>
    </div>
  );
}
