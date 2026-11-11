import { useEffect, useState } from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Welcome from './components/Welcome.jsx';
import Thread from './components/Thread.jsx';
import Composer from './components/Composer.jsx';
import LearningPreferences from "./components/LearningPreferences/LearningPreferences.jsx"
import { askTutor, toHistory, clarifyMessage, computeStats } from './api.js';
import { normalizeLearning } from '../../shared/learning.mjs';
import { migrateStore, needsStart } from './sessions.js';

const STORE = 'thinkingcap:v1';
const LEARNING_STORE = 'thinkingcap:learning:v1';

const uid = () => Math.random().toString(36).slice(2, 10);

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return migrateStore(JSON.parse(raw));
  } catch {
    /* storage unavailable: start fresh */
  }
  return { sessions: [], courses: [], activeId: null };
}

function loadLearning() {
  try {
    const raw = localStorage.getItem(LEARNING_STORE);
    if (raw) {
      return normalizeLearning(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  return normalizeLearning();
}

export default function App() {
  const [store, setStore] = useState(load);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingCourse, setPendingCourse] = useState(null);
  const [prefs, setPrefs] = useState({ textScale: 1, contrast: false });
  const [sidebarOpen, setSidebarOpen] = useState(true); // Left side panel
  const [learning, setLearning] = useState(loadLearning); // learningPreferences panel
  const [learningPanelOpen, setLearningPanelOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [store]);

  useEffect(() => {
    try {
      localStorage.setItem(LEARNING_STORE, JSON.stringify(learning));
    } catch {
      /* ignore */
    }
  }, [learning]);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', prefs.textScale);
    document.documentElement.dataset.contrast = prefs.contrast ? 'high' : 'normal';
  }, [prefs]);

  const active = store.sessions.find((s) => s.id === store.activeId) || null;
  // A summary needs at least one real tutor turn to talk about.
  const canSummarize = Boolean(active?.turns.some((t) => t.role === 'tutor' && !['modes', 'error'].includes(t.kind)));

  const patchSession = (id, fn) =>
    setStore((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)) }));

  // Ask the server for the next tutor turn and append it (or an error card) to the session.
  // Each tutor turn remembers the intent that produced it (used for the summary's activity counts).
  async function run({ sessionId, intent, turns, topic, extra }) {
    setBusy(true);
    try {
      // Snapshot the current preferences at dispatch. Later changes affect the
      // next request (including retries), not a response already in flight.
      const turn = await askTutor({ ...extra, intent, topic, learning, history: toHistory(turns) });
      const stats = intent === 'summary' ? extra?.stats : undefined;
      patchSession(sessionId, (s) => ({
        ...s,
        turns: [...s.turns, { id: uid(), role: 'tutor', ...turn, intent, ...(stats ? { stats } : {}) }],
      }));
    } catch (err) {
      patchSession(sessionId, (s) => ({
        ...s,
        turns: [
          ...s.turns,
          { id: uid(), role: 'tutor', kind: 'error', message: err.message, retry: { intent, extra } },
        ],
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
    if (!t || busy) return;
    setDraft('');
    if (!active) {
      // Start immediately using the preferences in the sidebar.
      const session = {
        id: uid(),
        title: t.length > 36 ? `${t.slice(0, 34)}…` : t,
        topic: t,
        courseId: pendingCourse,
        turns: [
          { id: uid(), role: 'student', text: t },
        ],
      };
      setStore((s) => ({ ...s, sessions: [session, ...s.sessions], activeId: session.id }));
      run({ sessionId: session.id, intent: 'start', turns: session.turns, topic: session.topic });
      return;
    }
    const turns = [...active.turns, { id: uid(), role: 'student', text: t }];
    patchSession(active.id, (s) => ({ ...s, turns }));
    run({ sessionId: active.id, intent: needsStart(active.turns) ? 'start' : 'reply', turns, topic: active.topic });
  }

  function intent(name, extra) {
    if (busy || !active) return;
    let turns = active.turns;
    if (name === 'clarify') {
      // Show the request in the thread so it is also part of the history the tutor sees.
      turns = [...turns, { id: uid(), role: 'student', text: clarifyMessage(extra) }];
      patchSession(active.id, (s) => ({ ...s, turns }));
    }
    const payload = name === 'summary' ? { ...extra, stats: computeStats(turns) } : extra;
    run({ sessionId: active.id, intent: name, turns, topic: active.topic, extra: payload });
  }

  // Re-send the request behind an error card. The student's own turn is already in the thread.
  function retry(errorTurn) {
    if (busy || !active || !errorTurn.retry) return;
    const turns = active.turns.filter((t) => t.id !== errorTurn.id);
    patchSession(active.id, (s) => ({ ...s, turns }));
    run({
      sessionId: active.id,
      intent: errorTurn.retry.intent,
      turns,
      topic: active.topic,
      extra: errorTurn.retry.extra,
    });
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
      inSession={Boolean(active)}
      canSummarize={canSummarize}
      onIntent={intent}
    />
  );

  const course = store.courses.find((c) => c.id === (active ? active.courseId : pendingCourse));

  return (
    <div className={`app ${sidebarOpen ? '' : 'side-closed'} ${learningPanelOpen ? '' : 'prefs-closed'}`}>
      <div className="side-wrap">
        <Sidebar
            store={store}
            onNew={openNew}
            onOpen={(id) => setStore((s) => ({ ...s, activeId: id }))}
            onAddCourse={addCourse}
            prefs={prefs}
            setPrefs={setPrefs}
            collapsed={!sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            />
      </div>

      <main className="main">
        <header className="topbar">
          {!sidebarOpen && (
            <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <PanelLeft size={20} />
            </button>
          )}
          <span>ThinkingCap</span>
          {course && <span>/ {course.name}</span>}
          <span className="crumb">{active ? active.title : 'New session'}</span>
          {!learningPanelOpen && (
            <button className="icon-btn mobile-only reopen" onClick={() => setLearningPanelOpen(true)} aria-label="Open learning preferences">
            <PanelRight size={20} />
            </button>
          )}
        </header>
        {active ? (
          <>
            <Thread
              turns={active.turns}
              busy={busy}
              onFill={setDraft}
              onQuizAnswer={answerQuiz}
              onIntent={intent}
              onRetry={retry}
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
      <div className="prefs-wrap">
        <LearningPreferences
        value={learning}
        onChange={setLearning}
        collapsed={!learningPanelOpen}
        onToggle={() => setLearningPanelOpen((o) => !o)}
        />
      </div>
    </div>
  );
}
