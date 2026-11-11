import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { getMaterialFile } from '../materialFiles.js';
import { isMaterialExpired } from '../../../shared/materials.mjs';

// Shows the browser's saved copy of an attached file: images inline, PDFs in
// the browser's PDF viewer, text as plain text.
export default function MaterialViewer({ material, onClose }) {
  const dialog = useRef(null);
  const [state, setState] = useState({ status: 'loading' });
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; showModal() throws if already open.
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    getMaterialFile(material.id).then(async (blob) => {
      if (cancelled) return;
      if (!blob) return setState({ status: 'missing' });
      url = URL.createObjectURL(new Blob([blob], { type: material.mimeType }));
      const text = material.mimeType === 'text/plain' ? await blob.text() : null;
      if (!cancelled) setState({ status: 'ready', url, text });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [material]);

  const { mimeType, name } = material;

  return (
    <dialog
      ref={dialog}
      className="viewer"
      aria-label={`Preview of ${name}`}
      onClose={onClose}
      // A click on the backdrop (the dialog itself, outside its content) closes it.
      onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}
    >
      <div className="viewer-inner">
        <header className="viewer-head">
          <span className="viewer-title" title={name}>{name}</span>
          {isMaterialExpired(material) && <span className="file-chip-status">expired on Gemini, add it again for the tutor to use it</span>}
          {state.status === 'ready' && (
            <a className="icon-btn" href={state.url} target="_blank" rel="noreferrer" aria-label={`Open ${name} in a new tab`}>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
          <button className="icon-btn" onClick={() => dialog.current.close()} aria-label="Close preview">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="viewer-body">
          {state.status === 'loading' && <p className="thinking" role="status">Loading…</p>}
          {state.status === 'missing' && (
            <p className="viewer-empty">
              No preview saved for this file. Files added before previews existed, or in another browser, can’t be shown. The tutor can still use it until it expires.
            </p>
          )}
          {state.status === 'ready' && mimeType.startsWith('image/') && !imageFailed && <img src={state.url} alt={name} onError={() => setImageFailed(true)} />}
          {imageFailed && <p className="viewer-empty">This browser can’t display this image type (HEIC images only show in Safari). Use the open-in-new-tab button to download it.</p>}
          {state.status === 'ready' && mimeType === 'application/pdf' && <iframe src={state.url} title={name} />}
          {state.status === 'ready' && mimeType === 'text/plain' && <pre>{state.text}</pre>}
        </div>
      </div>
    </dialog>
  );
}
