import { useEffect } from 'react';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import appImage from '../assets/images/app-image.png';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="dlg about-dlg" role="dialog" aria-modal="true" aria-label="About EasyNote"
        onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-head">
          <h3>About EasyNote</h3>
          <button className="x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="about">
          <img className="logo" src={appImage} alt="EasyNote" />
          <h3>EasyNote</h3>
          <div className="ver">Version 1.0.0 · build 240</div>
          <p>A minimalist, markdown-first notebook with built-in AI editing. Light &amp; dark, LTR &amp; RTL.</p>
          <div className="links">
            <button onClick={() => BrowserOpenURL('https://wails.io')}>Website</button>
            <button onClick={() => BrowserOpenURL('https://wails.io')}>Licenses</button>
            <button onClick={() => BrowserOpenURL('https://wails.io')}>Check for updates</button>
          </div>
        </div>
        <div className="dlg-foot" style={{ justifyContent: 'center' }}>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
