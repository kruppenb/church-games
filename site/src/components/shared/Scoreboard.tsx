import { useEffect, useRef, useState } from "react";

interface ScoreboardProps {
  score: number;
  streak?: number;
}

export function Scoreboard({ score, streak = 0 }: ScoreboardProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const prevScoreRef = useRef(0);

  // Animate the score counting up
  useEffect(() => {
    const start = prevScoreRef.current;
    const end = score;
    if (start === end) return;

    const duration = 400; // ms
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(start + (end - start) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevScoreRef.current = end;
      }
    }

    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="scoreboard">
      <div className="scoreboard-score">
        <span className="scoreboard-label">Score</span>
        <span className="scoreboard-value">{displayScore}</span>
      </div>
      {streak > 2 && (
        <div className="scoreboard-streak">
          <span className="scoreboard-streak-icon" aria-hidden="true">
            &#128293;
          </span>
          <span className="scoreboard-streak-count">{streak} streak!</span>
        </div>
      )}
    </div>
  );
}
