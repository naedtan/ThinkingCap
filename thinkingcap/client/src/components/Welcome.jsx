import { GraduationCap } from 'lucide-react';

const STEPS = ['Guided steps', 'Periodic check-ins', 'Student-led pacing', 'Teach-back mastery'];

export default function Welcome({ children }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <span className="logo big"><GraduationCap size={30} aria-hidden="true" /></span>
        <h1>Welcome to ThinkingCap</h1>
        <p className="lede">
          Your interactive learning co-pilot. I’ll break problems down step by step, check your understanding, and help
          you teach concepts back to master them.
        </p>
        {children}
        <ol className="how" aria-label="How ThinkingCap works">
          {STEPS.map((s, i) => (
            <li key={s}><span className="num">{i + 1}</span>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
