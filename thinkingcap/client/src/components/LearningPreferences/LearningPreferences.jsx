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
const LEVEL_BARS = { low: 1, medium: 2, high: 3 };

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

// Bar icon for Interaction Level. `active` = how many bars are full strength
// (3 for the heading, 1-3 for the collapsed rail's level buttons).
function LevelsIcon({ size = 18, active = 3 }) {
  const bars = [
    { x: 6, y2: 15 },
    { x: 12, y2: 10 },
    { x: 18, y2: 4 },
  ];
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
      {bars.map((b, i) => (
        <line key={b.x} x1={b.x} y1="20" x2={b.x} y2={b.y2} opacity={i < active ? 1 : 0.25} />
      ))}
    </svg>
  );
}

// Space/Enter activate a card; preventDefault stops Space from scrolling the panel.
const onActivate = (fn) => (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    fn();
  }
};

export default function LearningPreferences({ value, onChange, collapsed, onToggle }) {
  const { level, types, style } = value;

  const pickInteractionLevel = (next) => onChange({ ...value, level: next });
  const selectInteractionType = (id) => onChange({ ...value, types: { ...types, [id]: !types[id] } });
  const pickExplanationStyle = (id) => onChange({ ...value, style: id });

  if (collapsed) {
    return (
      <aside className="rail rail-right" aria-label="Learning preferences (collapsed)">
        <button className="icon-btn has-tip" data-tip="Open preferences" onClick={onToggle} aria-label="Open preferences">
          <PanelRight size={22} aria-hidden="true" />
        </button>
        <span className="rail-divider" aria-hidden="true" />

        {/* Interaction level: 1, 2 or 3 filled bars */}
        <div className="rail-group" role="radiogroup" aria-label="Interaction level">
          {Object.keys(LEVELS).map((key) => {
            const label = `${key[0].toUpperCase() + key.slice(1)} interaction`;
            return (
              <button
                key={key}
                role="radio"
                aria-checked={level === key}
                aria-label={label}
                data-tip={label}
                className={`rail-btn has-tip ${level === key ? "is-on" : ""}`}
                onClick={() => pickInteractionLevel(key)}
              >
                <LevelsIcon size={18} active={LEVEL_BARS[key]} />
              </button>
            );
          })}
        </div>
        <span className="rail-divider" aria-hidden="true" />

        {/* Interaction types */}
        {INTERACTION_TYPES.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            className={`rail-btn has-tip ${types[id] ? "is-on" : ""}`}
            aria-pressed={types[id]}
            aria-label={title}
            data-tip={`${title}: ${types[id] ? "on" : "off"}`}
            onClick={() => selectInteractionType(id)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
        <span className="rail-divider" aria-hidden="true" />

        {/* Explanation style */}
        <div className="rail-group" role="radiogroup" aria-label="Explanation style">
          {EXPLANATION_STYLES.map(({ id, icon: Icon, title }) => (
            <button
              key={id}
              role="radio"
              aria-checked={style === id}
              aria-label={title}
              data-tip={title}
              className={`rail-btn has-tip ${style === id ? "is-on" : ""}`}
              onClick={() => pickExplanationStyle(id)}
            >
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </aside>
    );
  }

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

        {/* Interaction types: the whole card is the switch */}
        <section className="lp-section">
          <h3 className="lp-heading">
            <Brain size={18} /> Interaction Types
          </h3>
          <p className="lp-hint">Interactive activities to include</p>

          <div className="lp-stack">
            {INTERACTION_TYPES.map(({ id, icon: Icon, title, desc }) => (
              <div
                className={`lp-card lp-card-clickable ${types[id] ? "is-selected" : ""}`}
                key={id}
                role="switch"
                aria-checked={types[id]}
                aria-label={title}
                tabIndex={0}
                onClick={() => selectInteractionType(id)}
                onKeyDown={onActivate(() => selectInteractionType(id))}
              >
                <span className="lp-badge"><Icon size={18} /></span>
                <div className="lp-card-text">
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </div>
                <span className={`lp-switch ${types[id] ? "is-on" : ""}`} aria-hidden="true" />
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
                onKeyDown={onActivate(() => pickExplanationStyle(id))}
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