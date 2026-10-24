import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Welcome from './components/Welcome.jsx';
import Thread from './components/Thread.jsx';
import Composer from './components/Composer.jsx';
import { askTutor, toHistory } from './api.js';

const STORE = 'thinkingcap:v1';
const uid = () => Math.random().toString(36).slice(2, 10);

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable: start fresh */
  }
  return { sessions: [], courses: [], activeId: null };
}

export default function App() {
  const [store, setStore] = useState(load);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingCourse, setPendingCourse] = useState(null);
  const [prefs, setPrefs] = useState({ textScale: 1, contrast: false });

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [store]);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', prefs.textScale);
    document.documentElement.dataset.contrast = prefs.contrast ? 'high' : 'normal';
  }, [prefs]);

  const active = store.sessions.find((s) => s.id === store.activeId) || null;
  const last = active?.turns.at(-1);
  const awaitingModes = last?.kind === 'modes' && !last.chosen;

  const patchSession = (id, fn) =>
    setStore((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)) }));

  // Ask the server for the next tutor turn and append it (or an error card) to the session.
  async function run({ sessionId, intent, turns, topic, modes, extra }) {
    setBusy(true);
    try {
      const turn = await askTutor({ intent, topic, modes, history: toHistory(turns), ...extra });
      patchSession(sessionId, (s) => ({ ...s, turns: [...s.turns, { id: uid(), role: 'tutor', ...turn }] }));
    } catch (err) {
      patchSession(sessionId, (s) => ({
        ...s,
        turns: [...s.turns, { id: uid(), role: 'tutor', kind: 'error', message: err.message }],
      }));
    } finally {
      setBusy(false);
    }
  }

  function openNew(courseId = null) {
    setPendingCourse(courseId);
    setDraft('');
    setStore((s) => ({ ...s, activeId: null }));
  }

  function addCourse() {
    const name = window.prompt('Course name');
    if (!name?.trim()) return;
    setStore((s) => ({ ...s, courses: [...s.courses, { id: uid(), name: name.trim() }] }));
  }

  function submit(text) {
    const t = text.trim();
    if (!t || busy || awaitingModes) return;
    setDraft('');
    if (!active) {
      // First message creates the session, then asks how the student wants to learn.
      const session = {
        id: uid(),
        title: t.length > 36 ? `${t.slice(0, 34)}…` : t,
        topic: t,
        courseId: pendingCourse,
        modes: [],
        turns: [
          { id: uid(), role: 'student', text: t },
          { id: uid(), role: 'tutor', kind: 'modes' },
        ],
      };
      setStore((s) => ({ ...s, sessions: [session, ...s.sessions], activeId: session.id }));
      return;
    }
    const turns = [...active.turns, { id: uid(), role: 'student', text: t }];
    patchSession(active.id, (s) => ({ ...s, turns }));
    run({ sessionId: active.id, intent: 'reply', turns, topic: active.topic, modes: active.modes });
  }

  function chooseModes(modes) {
    const turns = active.turns.map((t) => (t.kind === 'modes' ? { ...t, chosen: modes } : t));
    patchSession(active.id, (s) => ({ ...s, modes, turns }));
    run({ sessionId: active.id, intent: 'start', turns, topic: active.topic, modes });
  }

  function intent(name, extra) {
    if (busy || !active) return;
    run({ sessionId: active.id, intent: name, turns: active.turns, topic: active.topic, modes: active.modes, extra });
  }

  function answerQuiz(turnId, picked) {
    patchSession(active.id, (s) => ({
      ...s,
      turns: s.turns.map((t) => (t.id === turnId ? { ...t, picked } : t)),
    }));
  }

  const composer = (
    <Composer
      draft={draft}
      setDraft={setDraft}
      onSubmit={submit}
      busy={busy}
      disabled={awaitingModes}
      inSession={Boolean(active)}
      onIntent={intent}
    />
  );

  const course = store.courses.find((c) => c.id === (active ? active.courseId : pendingCourse));

  return (
    <div className="app">
      <Sidebar
        store={store}
        onNew={openNew}
        onOpen={(id) => setStore((s) => ({ ...s, activeId: id }))}
        onAddCourse={addCourse}
        prefs={prefs}
        setPrefs={setPrefs}
      />
      <main className="main">
        <header className="topbar">
          <span>ThinkingCap</span>
          {course && <span>/ {course.name}</span>}
          <span className="crumb">{active ? active.title : 'New session'}</span>
        </header>
        {active ? (
          <>
            <Thread
              turns={active.turns}
              busy={busy}
              onFill={setDraft}
              onQuizAnswer={answerQuiz}
              onChooseModes={chooseModes}
              onIntent={intent}
              onNew={() => openNew(active.courseId)}
            />
            <div className="dock">
              <div className="dock-inner">{composer}</div>
            </div>
          </>
        ) : (
          <Welcome>{composer}</Welcome>
        )}
      </main>
    </div>
  );
}
