import { GraduationCap, Plus, Folder, PanelLeft, Settings } from 'lucide-react';

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

export default function Sidebar({ store, onNew, onOpen, onAddCourse, prefs, setPrefs, collapsed, onToggle }) {
  const { sessions, courses, activeId } = store;
  // Group in one pass rather than re-scanning every session for every course.
  const byCourse = new Map();
  for (const session of sessions) {
    const key = session.courseId || null;
    if (!byCourse.has(key)) byCourse.set(key, []);
    byCourse.get(key).push(session);
  }
  const unassigned = byCourse.get(null) || [];
  const step = (d) =>
    setPrefs((p) => ({ ...p, textScale: Math.min(1.4, Math.max(0.9, Math.round((p.textScale + d) * 10) / 10)) }));

  if (collapsed) {
    return (
        <aside className="rail rail-left" aria-label="Sidebar (collapsed)">
        <button className="icon-btn rail-toggle has-tip" data-tip="Open sidebar" onClick={onToggle} aria-label="Open sidebar">
            <PanelLeft size={22} aria-hidden="true" />
        </button>
        <span className="rail-divider" aria-hidden="true" />
        <button className="rail-btn rail-new has-tip" data-tip="New session" onClick={() => onNew(null)} aria-label="New session">
            <Plus size={20} aria-hidden="true" />
        </button>
        <span className="rail-spacer" />
        <span className="rail-divider" aria-hidden="true" />
        <button className="rail-btn rail-plain has-tip" data-tip="Display settings" onClick={onToggle} aria-label="Open sidebar for display settings">
            <Settings size={20} aria-hidden="true" />
        </button>
        </aside>
    );
  }
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo"><GraduationCap size={20} aria-hidden="true" /></span>
        ThinkingCap
        <button className="icon-btn brand-toggle" onClick={onToggle} aria-label="Close sidebar">
            <PanelLeft size={22} aria-hidden="true" />
        </button>
      </div>
      <button className="btn-primary wide" onClick={() => onNew(null)}>
        <Plus size={14} aria-hidden="true" /> New session
      </button>

      <nav aria-label="Sessions and courses" className="side-nav">
        <h2 className="side-h">Sessions</h2>
        {unassigned.length === 0 ? (
          <p className="side-empty">Sessions you start will show up here.</p>
        ) : (
          <SessionList sessions={unassigned} activeId={activeId} onOpen={onOpen} />
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
            <SessionList sessions={byCourse.get(c.id) || []} activeId={activeId} onOpen={onOpen} />
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
