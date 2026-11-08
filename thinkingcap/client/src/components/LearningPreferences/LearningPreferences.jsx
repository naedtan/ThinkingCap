import {
  PanelRight,
  Brain,
  MessageSquareText,
  HelpCircle,
  PenLine,
  Users,
  ListChecks,
  Zap,
  Layers,
} from "lucide-react";
import "./LearningPreferences.css";

const LEVELS = {
  low: "Mostly direct explanations, with few interactive activities.",
  medium: "A balanced blend of explanations and occasional interactive activities.",
  high: "Frequent questions, exercises, and check-ins throughout the session.",
};

const INTERACTION_TYPES = [
  { id: "guided", icon: HelpCircle, title: "Guided Questions", desc: "Open-ended questions to think through" },
  { id: "practice", icon: PenLine, title: "Practice Problems", desc: "Exercises to apply what you learn" },
  { id: "teachback", icon: Users, title: "Teach-Back Activities", desc: "Explain concepts back to ThinkingCap" },
  { id: "quizzes", icon: ListChecks, title: "Mini Quizzes", desc: "Quick checks of your understanding" },
];

const EXPLANATION_STYLES = [
  { id: "concise", icon: Zap, title: "Concise Explanations", desc: "Direct answers and core takeaways" },
  { id: "stepwise", icon: Layers, title: "Step-by-Step", desc: "Break each idea into smaller steps" },
];

// Three ascending bars, drawn to match lucide's stroke style.
function LevelsIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="20" x2="6" y2="15" />
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
    </svg>
  );
}

export default function LearningPreferences({ value, onChange, onToggle }) {
  const { level, types, style } = value;

  const pickInteractionLevel = (next) => onChange({ ...value, level: next });
  const selectInteractionType = (id) => onChange({ ...value, types: { ...types, [id]: !types[id] } });
  const pickExplanationStyle = (id) => onChange({ ...value, style: id });

  return (
    <aside className="lp" aria-label="Learning preferences">
      <header className="lp-header">
        <div>
          <h2 className="lp-title">Learning Preferences</h2>
          <p className="lp-sub">Customize how ThinkingCap teaches you</p>
        </div>
        <button className="icon-btn" onClick={onToggle} aria-label="Close preferences">
          <PanelRight size={22} />
        </button>
      </header>

      <div className="lp-body">
        {/* Interaction level */}
        <section className="lp-section">
          <h3 className="lp-heading">
            <LevelsIcon size={18} /> Interaction Level
          </h3>
          <p className="lp-hint">How often ThinkingCap checks in</p>

          <div className="lp-segmented" role="radiogroup" aria-label="Interaction level">
            {Object.keys(LEVELS).map((key) => (
              <button
                key={key}
                role="radio"
                aria-checked={level === key}
                className={level === key ? "is-active" : ""}
                onClick={() => pickInteractionLevel(key)}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
          <p className="lp-note">{LEVELS[level]}</p>
        </section>

        {/* Interaction types */}
        <section className="lp-section">
          <h3 className="lp-heading">
            <Brain size={18} /> Interaction Types
          </h3>
          <p className="lp-hint">Interactive activities to include</p>

          <div className="lp-stack">
            {INTERACTION_TYPES.map(({ id, icon: Icon, title, desc }) => (
              <div className={`lp-card ${types[id] ? "is-selected" : ""}`} key={id}>
                <span className="lp-badge"><Icon size={18} /></span>
                <div className="lp-card-text">
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </div>
                <button
                  role="switch"
                  aria-checked={types[id]}
                  aria-label={title}
                  className={`lp-switch ${types[id] ? "is-on" : ""}`}
                  onClick={() => selectInteractionType(id)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Explanation style */}
        <section className="lp-section">
          <h3 className="lp-heading">
            <MessageSquareText size={18} /> Explanation Style
          </h3>
          <p className="lp-hint">How concepts are explained</p>

          <div className="lp-stack" role="radiogroup" aria-label="Explanation style">
            {EXPLANATION_STYLES.map(({ id, icon: Icon, title, desc }) => (
              <div
                className={`lp-card lp-card-clickable ${style === id ? "is-selected" : ""}`}
                key={id}
                role="radio"
                aria-checked={style === id}
                tabIndex={0}
                onClick={() => pickExplanationStyle(id)}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && pickExplanationStyle(id)}
              >
                <span className="lp-badge"><Icon size={18} /></span>
                <div className="lp-card-text">
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </div>
                <span className={`lp-radio ${style === id ? "is-on" : ""}`} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}