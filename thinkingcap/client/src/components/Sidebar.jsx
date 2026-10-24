import { GraduationCap, Plus, Folder } from 'lucide-react';

function SessionList({ sessions, activeId, onOpen }) {
  return (
    <ul className="side-list">
      {sessions.map((s) => (
        <li key={s.id}>
          <button
            className={`side-item ${s.id === activeId ? 'is-active' : ''}`}
            aria-current={s.id === activeId ? 'page' : undefined}
            onClick={() => onOpen(s.id)}
          >
            {s.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Sidebar({ store, onNew, onOpen, onAddCourse, prefs, setPrefs }) {
  const { sessions, courses, activeId } = store;
  const step = (d) =>
    setPrefs((p) => ({ ...p, textScale: Math.min(1.4, Math.max(0.9, Math.round((p.textScale + d) * 10) / 10)) }));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo"><GraduationCap size={20} aria-hidden="true" /></span>
        ThinkingCap
      </div>
      <button className="btn-primary wide" onClick={() => onNew(null)}>
        <Plus size={16} aria-hidden="true" /> New session
      </button>

      <nav aria-label="Sessions and courses" className="side-nav">
        <h2 className="side-h">Sessions</h2>
        {sessions.filter((s) => !s.courseId).length === 0 ? (
          <p className="side-empty">Sessions you start will show up here.</p>
        ) : (
          <SessionList sessions={sessions.filter((s) => !s.courseId)} activeId={activeId} onOpen={onOpen} />
        )}

        <h2 className="side-h">Courses</h2>
        <button className="btn-ghost wide" onClick={onAddCourse}>
          <Plus size={14} aria-hidden="true" /> Add course
        </button>
        {courses.map((c) => (
          <div className="course" key={c.id}>
            <div className="course-head">
              <Folder size={14} aria-hidden="true" />
              <span>{c.name}</span>
              <button className="icon-btn" aria-label={`New session in ${c.name}`} onClick={() => onNew(c.id)}>
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
            <SessionList sessions={sessions.filter((s) => s.courseId === c.id)} activeId={activeId} onOpen={onOpen} />
          </div>
        ))}
      </nav>

      <fieldset className="a11y">
        <legend>Display</legend>
        <div className="a11y-row">
          <span>Text size</span>
          <span className="a11y-btns">
            <button className="icon-btn" aria-label="Smaller text" onClick={() => step(-0.1)}>A−</button>
            <button className="icon-btn" aria-label="Larger text" onClick={() => step(0.1)}>A+</button>
          </span>
        </div>
        <label className="a11y-row">
          <span>High contrast</span>
          <input
            type="checkbox"
            checked={prefs.contrast}
            onChange={(e) => setPrefs((p) => ({ ...p, contrast: e.target.checked }))}
          />
        </label>
      </fieldset>
    </aside>
  );
}
