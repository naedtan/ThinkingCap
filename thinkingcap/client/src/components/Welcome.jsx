import { GraduationCap } from 'lucide-react';

export default function Welcome({ children }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <span className="logo big"><GraduationCap size={30} aria-hidden="true" /></span>
        <h1>Welcome to ThinkingCap</h1>
        <p className="lede">
          Ask a question or bring a problem to study. Use Learning Preferences to choose how explanations and
          activities fit your needs.
        </p>
        {children}
      </div>
    </div>
  );
}
