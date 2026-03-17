import { useEffect, useRef } from "react";

interface AnswerFeedbackProps {
  correct: boolean;
  explanation: string;
  onNext: () => void;
}

export function AnswerFeedback({
  correct,
  explanation,
  onNext,
}: AnswerFeedbackProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-advance after 3 seconds
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onNext();
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onNext]);

  function handleClick() {
    if (timerRef.current) clearTimeout(timerRef.current);
    onNext();
  }

  return (
    <div
      className={`answer-feedback ${correct ? "answer-feedback-correct" : "answer-feedback-wrong"}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      <div className="answer-feedback-icon" aria-hidden="true">
        {correct ? "\u2713" : "\u2717"}
      </div>
      <h2 className="answer-feedback-title">
        {correct ? "Correct!" : "Not quite!"}
      </h2>
      <p className="answer-feedback-explanation">{explanation}</p>
      <p className="answer-feedback-hint">Tap to continue</p>
    </div>
  );
}
