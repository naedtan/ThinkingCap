import { useEffect, useState } from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Welcome from './components/Welcome.jsx';
import Thread from './components/Thread.jsx';
import Composer from './components/Composer.jsx';
import LearningPreferences from './components/LearningPreferences/LearningPreferences.jsx';
import MaterialViewer from './components/MaterialViewer.jsx';
import { deleteMaterialFile, pruneMaterialFiles } from './materialFiles.js';
import { clarifyMessage, computeStats, materialOnlyMessage } from './api.js';
import { normalizeLearning } from '../../shared/learning.mjs';
import { migrateStore, needsStart } from './sessions.js';
import useStoredState from './hooks/useStoredState.js';
import useTutorRequest from './hooks/useTutorRequest.js';

const STORE = 'thinkingcap:v1';
const LEARNING_STORE = 'thinkingcap:learning:v1';

const uid = () => crypto.randomUUID();

export default function App() {
  const [store, setStore] = useStoredState(STORE, migrateStore);
  const [draft, setDraft] = useState('');
  const [pendingCourse, setPendingCourse] = useState(null);
  const [prefs, setPrefs] = useState({ textScale: 1, contrast: false });
  const [sidebarOpen, setSidebarOpen] = useState(true); // Left side panel
  const [learning, setLearning] = useStoredState(LEARNING_STORE, normalizeLearning);
  const [learningPanelOpen, setLearningPanelOpen] = useState(true);
  const [viewing, setViewing] = useState(null); // The material shown in the preview dialog.

  // Once per load, drop saved file copies that no session refers to.
  useEffect(() => {
    pruneMaterialFiles(store.sessions.flatMap((s) => (s.materials || []).map((m) => m.id)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', prefs.textScale);
    document.documentElement.dataset.contrast = prefs.contrast ? 'high' : 'normal';
  }, [prefs]);

  const active = store.sessions.find((s) => s.id === store.activeId) || null;
  // A summary needs at least one real tutor turn to talk about.
  const canSummarize = Boolean(active?.turns.some((t) => t.role === 'tutor' && !['modes', 'error'].includes(t.kind)));

  const patchSession = (id, fn) =>
    setStore((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)) }));

  const { run, isBusy, pendingSessionId } = useTutorRequest(learning, patchSession);
  const busy = pendingSessionId !== null;

  function openSession(id) {
    setDraft('');
    setStore((s) => ({ ...s, activeId: id }));
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

  // `attached` holds material records the composer already uploaded. Returns
  // whether the message was sent, so the composer knows to clear its files.
  function submit(text, attached = []) {
    let t = text.trim();
    if ((!t && !attached.length) || isBusy()) return false;
    const names = attached.map((m) => m.name);
    if (!t) t = materialOnlyMessage(names);
    const studentTurn = { id: uid(), role: 'student', text: t, ...(names.length ? { attachments: names } : {}) };
    setDraft('');
    if (!active) {
      // Start immediately using the preferences in the sidebar.
      const session = {
        id: uid(),
        title: t.length > 36 ? `${t.slice(0, 34)}…` : t,
        topic: t,
        courseId: pendingCourse,
        turns: [studentTurn],
        materials: attached,
      };
      setStore((s) => ({ ...s, sessions: [session, ...s.sessions], activeId: session.id }));
      run({ sessionId: session.id, intent: 'start', turns: session.turns, topic: session.topic, materials: session.materials });
      return true;
    }
    const turns = [...active.turns, studentTurn];
    const materials = [...(active.materials || []), ...attached];
    patchSession(active.id, (s) => ({ ...s, turns, materials }));
    run({ sessionId: active.id, intent: needsStart(active.turns) ? 'start' : 'reply', turns, topic: active.topic, materials });
    return true;
  }

  // Stop citing a file in this session. The file itself expires on Gemini's side.
  function removeMaterial(materialId) {
    if (!active) return;
    patchSession(active.id, (s) => ({ ...s, materials: (s.materials || []).filter((m) => m.id !== materialId) }));
    deleteMaterialFile(materialId);
  }

  // Message bubbles store file names; find the newest session file with that name.
  const findMaterial = (name) => active?.materials?.findLast((m) => m.name === name) || null;

  function intent(name, extra) {
    if (isBusy() || !active) return;
    let turns = active.turns;
    if (name === 'clarify') {
      // Show the request in the thread so it is also part of the history the tutor sees.
      turns = [...turns, { id: uid(), role: 'student', text: clarifyMessage(extra) }];
      patchSession(active.id, (s) => ({ ...s, turns }));
    }
    const payload = name === 'summary' ? { ...extra, stats: computeStats(turns) } : extra;
    run({ sessionId: active.id, intent: name, turns, topic: active.topic, extra: payload, materials: active.materials });
  }

  // Re-send the request behind an error card. The student's own turn is already in the thread.
  function retry(errorTurn) {
    if (isBusy() || !active || !errorTurn.retry) return;
    const turns = active.turns.filter((t) => t.id !== errorTurn.id);
    patchSession(active.id, (s) => ({ ...s, turns }));
    run({
      sessionId: active.id,
      intent: errorTurn.retry.intent,
      turns,
      topic: active.topic,
      extra: errorTurn.retry.extra,
      materials: active.materials,
    });
  }

  function answerQuiz(turnId, picked) {
    if (!active) return;
    patchSession(active.id, (s) => ({
      ...s,
      turns: s.turns.map((turn) => {
        const canAnswer = turn.id === turnId && turn.picked == null && turn.quiz?.options.some((option) => option.id === picked);
        return canAnswer ? { ...turn, picked } : turn;
      }),
    }));
  }

  const composer = (
    <Composer
      key={active?.id || 'new'}
      draft={draft}
      setDraft={setDraft}
      onSubmit={submit}
      busy={busy}
      waitingElsewhere={busy && pendingSessionId !== active?.id}
      inSession={Boolean(active)}
      canSummarize={canSummarize}
      onIntent={intent}
      materials={active?.materials || []}
      onRemoveMaterial={removeMaterial}
      onViewMaterial={setViewing}
    />
  );

  const course = store.courses.find((c) => c.id === (active ? active.courseId : pendingCourse));

  return (
    <div className={`app ${sidebarOpen ? '' : 'side-closed'} ${learningPanelOpen ? '' : 'prefs-closed'}`}>
      <div className="side-wrap">
        <Sidebar
          store={store}
          onNew={openNew}
          onOpen={openSession}
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
              busy={busy && pendingSessionId === active.id}
              requestBusy={busy}
              onFill={setDraft}
              onSendSuggestion={submit}
              onQuizAnswer={answerQuiz}
              onIntent={intent}
              onRetry={retry}
              onNew={() => openNew(active.courseId)}
              findMaterial={findMaterial}
              onViewMaterial={setViewing}
            />
            <div className="dock">
              <div className="dock-inner">{composer}</div>
            </div>
          </>
        ) : (
          <Welcome>{composer}</Welcome>
        )}
      </main>
      {viewing && <MaterialViewer material={viewing} onClose={() => setViewing(null)} />}
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
