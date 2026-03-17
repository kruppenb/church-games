import { useEffect, useRef, useState } from "react";

interface TimerProps {
  seconds: number;
  onComplete: () => void;
  paused?: boolean;
}

export function Timer({ seconds, onComplete, paused = false }: TimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const onCompleteRef = useRef(onComplete);

  // Keep the ref up to date
  onCompleteRef.current = onComplete;

  // Reset when seconds prop changes
  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (paused || remaining <= 0) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          // Use setTimeout so state update completes before callback
          setTimeout(() => onCompleteRef.current(), 0);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [paused, remaining <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const percentage = (remaining / seconds) * 100;
  const isUrgent = remaining <= 5 && remaining > 0;

  return (
    <div className={`timer ${isUrgent ? "timer-urgent" : ""}`}>
      <div className="timer-bar-track">
        <div
          className="timer-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="timer-text">{remaining}s</span>
    </div>
  );
}
