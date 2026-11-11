import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUp, ClipboardList, FileText, HelpCircle, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import ConfusedPanel from './ConfusedPanel.jsx';
import { uploadMaterial } from '../api.js';
import { saveMaterialFile } from '../materialFiles.js';
import { MATERIAL_ACCEPT, MATERIAL_LIMITS, isMaterialExpired, uniqueMaterialName, usableMaterials } from '../../../shared/materials.mjs';

const FileIcon = ({ mimeType }) => (mimeType?.startsWith('image/') ? <ImageIcon size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />);

export default function Composer({
  draft, setDraft, onSubmit, busy, waitingElsewhere, inSession, canSummarize, onIntent,
  materials = [], onRemoveMaterial, onViewMaterial,
}) {
  const [confusedOpen, setConfusedOpen] = useState(false);
  // Files picked for the next message: { key, name, mimeType, status: 'uploading' | 'ready' | 'error', material?, error? }
  const [staged, setStaged] = useState([]);
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);
  const fileInput = useRef(null);
  const uploads = useRef(new Map()); // key -> AbortController

  // When a suggestion or sentence starter fills the draft, move focus to the box so the student can keep typing.
  useEffect(() => {
    if (draft) ref.current?.focus();
  }, [draft]);

  // Leaving the session (or the page) cancels uploads still in progress.
  useEffect(() => () => uploads.current.forEach((controller) => controller.abort()), []);

  const placeholder = inSession
      ? 'Type your answer or thought…'
      : 'Ask a question, paste a problem, or ask me to quiz you on a concept…';

  const patchStaged = (key, patch) => setStaged((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const uploading = staged.some((item) => item.status === 'uploading');
  const ready = staged.filter((item) => item.status === 'ready');
  const expired = materials.filter((m) => isMaterialExpired(m));
  const inUse = usableMaterials(materials);
  const room = MATERIAL_LIMITS.perSession - inUse.length - staged.filter((item) => item.status !== 'error').length;

  // Pasted screenshots all arrive as "image.png", so give each file a name
  // no other file in this session (or this message) already uses.
  function nameFiles(files) {
    const taken = [...materials.map((m) => m.name), ...staged.map((item) => item.name)];
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    return files.map((file) => {
      const base = /^image\.(png|jpe?g|webp|heic|heif)$/i.test(file.name) ? `Pasted image ${stamp}.${file.name.split('.').pop()}` : file.name;
      const name = uniqueMaterialName(base, taken);
      taken.push(name);
      return name === file.name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified });
    });
  }

  function addFiles(fileList) {
    const files = nameFiles([...fileList]);
    if (!files.length) return;
    let left = room;
    const added = files.map((file) => {
      const key = crypto.randomUUID();
      if (left <= 0) return { key, name: file.name, status: 'error', error: `Limit is ${MATERIAL_LIMITS.perSession} files per session.` };
      left -= 1;
      const controller = new AbortController();
      uploads.current.set(key, controller);
      uploadMaterial(file, { signal: controller.signal })
        .then(async (material) => {
          await saveMaterialFile(material.id, file); // Local copy for previews.
          patchStaged(key, { status: 'ready', material, mimeType: material.mimeType });
        })
        .catch((error) => { if (!controller.signal.aborted) patchStaged(key, { status: 'error', error: error.message }); })
        .finally(() => uploads.current.delete(key));
      return { key, name: file.name, mimeType: file.type, status: 'uploading' };
    });
    setStaged((items) => [...items, ...added]);
  }

  function removeStaged(key) {
    uploads.current.get(key)?.abort();
    setStaged((items) => items.filter((item) => item.key !== key));
  }

  const canSend = !busy && !uploading && (draft.trim() || ready.length > 0);

  function send() {
    if (!canSend) return;
    if (onSubmit(draft, ready.map((item) => item.material))) setStaged([]);
  }

  return (
    <div className="composer-wrap">
      {waitingElsewhere && <p className="thinking" role="status">ThinkingCap is responding in another session. You can send a message when it finishes.</p>}
      {confusedOpen && inSession && (
        <ConfusedPanel
          busy={busy}
          onClose={() => setConfusedOpen(false)}
          onSend={(extra) => {
            setConfusedOpen(false);
            onIntent('clarify', extra);
          }}
        />
      )}
      {materials.length > 0 && (
        <div className="session-materials" aria-label="Material in this session">
          <span className="session-materials-label">Material in this session</span>
          {materials.map((m) => {
            const isExpired = isMaterialExpired(m);
            return (
              <span key={m.id} className={`file-chip ${isExpired ? 'is-expired' : ''}`} title={isExpired ? 'Expired: add this file again to keep using it' : m.name}>
                <button className="file-chip-open" onClick={() => onViewMaterial?.(m)} aria-label={`View ${m.name}`}>
                  <FileIcon mimeType={m.mimeType} />
                  <span className="file-chip-name">{m.name}</span>
                </button>
                {isExpired && <span className="file-chip-status">expired</span>}
                <button className="file-chip-x" aria-label={`Remove ${m.name} from this session`} onClick={() => onRemoveMaterial?.(m.id)}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            );
          })}
          {expired.length > 0 && (
            <p className="material-note">Gemini keeps files for 48 hours. Add expired files again to keep using them.</p>
          )}
        </div>
      )}
      <div
        className={`composer ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {staged.length > 0 && (
          <ul className="staged-files" aria-label="Files to send with your message">
            {staged.map((item) => (
              <li key={item.key} className={`file-chip is-${item.status}`} title={item.error || item.name}>
                {item.status === 'uploading' && <Loader2 size={14} className="spin" aria-hidden="true" />}
                {item.status === 'error' && <AlertCircle size={14} aria-hidden="true" />}
                {item.status === 'ready' ? (
                  <button className="file-chip-open" onClick={() => onViewMaterial?.(item.material)} aria-label={`View ${item.name}`}>
                    <FileIcon mimeType={item.mimeType} />
                    <span className="file-chip-name">{item.name}</span>
                  </button>
                ) : (
                  <span className="file-chip-name">{item.name}</span>
                )}
                {item.status === 'uploading' && <span className="file-chip-status" role="status">uploading…</span>}
                {item.status === 'error' && <span className="file-chip-status" role="alert">{item.error}</span>}
                <button className="file-chip-x" aria-label={`Remove ${item.name}`} onClick={() => removeStaged(item.key)}>
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={ref}
          rows={2}
          value={draft}
          placeholder={placeholder}
          aria-label="Your message"
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            // Pasting a screenshot attaches it instead of doing nothing.
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-chips">
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={MATERIAL_ACCEPT}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = ''; // Allow picking the same file again later.
              }}
            />
            <button
              className="chip"
              disabled={room <= 0}
              title={room <= 0 ? `Limit is ${MATERIAL_LIMITS.perSession} files per session` : 'PDFs, images, or text files up to 20 MB'}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={14} aria-hidden="true" /> Add material
            </button>
            {inSession && (
              <>
                <button className="chip lav" aria-expanded={confusedOpen} disabled={busy} onClick={() => setConfusedOpen((o) => !o)}>
                  <HelpCircle size={14} aria-hidden="true" /> I’m confused
                </button>
                <button className="chip" disabled={busy || !canSummarize} onClick={() => onIntent('summary')}>
                  <ClipboardList size={14} aria-hidden="true" /> Session Summary
                </button>
              </>
            )}
          </div>
          <span className="send-hint">{uploading ? 'Uploading…' : 'Enter to send'}</span>
          <button className="send" aria-label="Send" disabled={!canSend} onClick={send}>
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
