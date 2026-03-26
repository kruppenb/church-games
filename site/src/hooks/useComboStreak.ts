import { useState, useRef, useCallback } from "react";
import { sounds } from "@/lib/sounds";

interface UseComboStreakReturn {
  streak: number;
  streakJustBroke: boolean;
  recordAnswer: (correct: boolean) => { newStreak: number };
  reset: () => void;
}

export function useComboStreak(): UseComboStreakReturn {
  const [streak, setStreak] = useState(0);
  const [streakJustBroke, setStreakJustBroke] = useState(false);
  const brokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streakRef = useRef(0);

  const recordAnswer = useCallback((correct: boolean): { newStreak: number } => {
    if (brokeTimerRef.current) {
      clearTimeout(brokeTimerRef.current);
      brokeTimerRef.current = null;
    }
    setStreakJustBroke(false);

    if (correct) {
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      setStreak(newStreak);
      if (newStreak >= 2) {
        sounds.playStreakTone(newStreak);
      }
      return { newStreak };
    } else {
      const oldStreak = streakRef.current;
      streakRef.current = 0;
      setStreak(0);
      if (oldStreak >= 2) {
        setStreakJustBroke(true);
        sounds.playStreakLost();
        brokeTimerRef.current = setTimeout(() => {
          setStreakJustBroke(false);
          brokeTimerRef.current = null;
        }, 800);
      }
      return { newStreak: 0 };
    }
  }, []);

  const reset = useCallback(() => {
    streakRef.current = 0;
    setStreak(0);
    setStreakJustBroke(false);
    if (brokeTimerRef.current) {
      clearTimeout(brokeTimerRef.current);
      brokeTimerRef.current = null;
    }
  }, []);

  return { streak, streakJustBroke, recordAnswer, reset };
}
