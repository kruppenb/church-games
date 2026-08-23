import { useCallback, useEffect, useRef, useState } from "react";
import { useDifficulty } from "@/hooks/useDifficulty";
import { sounds } from "@/lib/sounds";
import {
  getBoard,
  getLastInitials,
  getWeekKey,
  isAllowedInitials,
  qualifies,
  submitScore,
} from "@/lib/leaderboard-store";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";

interface HighScoreFlowProps {
  /** Catalog game id, e.g. "survivors" — must match Landing's GAMES ids. */
  gameId: string;
  /** Display name, e.g. "Survivors". */
  gameName: string;
  score: number;
  /** Parent sets true on its game-over / results screen. */
  show: boolean;
  /** Called when the flow closes (either path). */
  onDone: () => void;
}

type Phase = "idle" | "entry" | "board";

const SLOT_COUNT = 3;
const SHAKE_MS = 500;

function cycleLetter(letter: string, delta: number): string {
  const index = letter.charCodeAt(0) - 65;
  const safe = index >= 0 && index < 26 ? index : 0;
  return String.fromCharCode(65 + ((safe + delta + 26) % 26));
}

function splitInitials(initials: string): string[] {
  return [initials[0] ?? "A", initials[1] ?? "A", initials[2] ?? "A"];
}

export function HighScoreFlow({
  gameId,
  gameName,
  score,
  show,
  onDone,
}: HighScoreFlowProps) {
  const { difficulty } = useDifficulty();

  const [phase, setPhase] = useState<Phase>("idle");
  const [letters, setLetters] = useState<string[]>(["A", "A", "A"]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [rank, setRank] = useState(-1);
  const [highlightTs, setHighlightTs] = useState<number | undefined>(undefined);
  const [weekKey, setWeekKey] = useState(() => getWeekKey());

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Refs mirror state so the window keydown listener never reads stale values
  // (rapid keystrokes can arrive before React re-renders).
  const lettersRef = useRef(letters);
  lettersRef.current = letters;

  const activeSlotRef = useRef(activeSlot);

  const focusSlot = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(SLOT_COUNT - 1, index));
    activeSlotRef.current = clamped;
    setActiveSlot(clamped);
  }, []);

  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (shakeTimerRef.current !== null) clearTimeout(shakeTimerRef.current);
    },
    [],
  );

  // Open / close. Non-qualifying scores close the flow from an effect so the
  // parent is never notified during render.
  useEffect(() => {
    if (!show) {
      setPhase("idle");
      return;
    }
    if (!qualifies(gameId, score)) {
      setPhase("idle");
      onDoneRef.current();
      return;
    }
    const prefill = splitInitials(getLastInitials() ?? "AAA");
    lettersRef.current = prefill;
    setLetters(prefill);
    focusSlot(0);
    setShaking(false);
    setRank(-1);
    setHighlightTs(undefined);
    setWeekKey(getWeekKey());
    setPhase("entry");
  }, [show, gameId, score]);

  // One celebration when the rank reveal lands.
  useEffect(() => {
    if (phase === "board") sounds.playCelebration();
  }, [phase]);

  const setLetterAt = useCallback((index: number, letter: string) => {
    const next = lettersRef.current.slice();
    next[index] = letter;
    lettersRef.current = next;
    setLetters(next);
    sounds.playClick();
  }, []);

  const bumpSlot = useCallback(
    (index: number, delta: number) => {
      focusSlot(index);
      setLetterAt(index, cycleLetter(lettersRef.current[index], delta));
    },
    [focusSlot, setLetterAt],
  );

  const handleOk = useCallback(() => {
    const initials = lettersRef.current.join("");
    if (!isAllowedInitials(initials)) {
      // Blocked combo: shake the slots, no error text, no submit.
      // Refocus the first slot so typing again overwrites from the start.
      focusSlot(0);
      setShaking(true);
      if (shakeTimerRef.current !== null) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShaking(false), SHAKE_MS);
      return;
    }
    const newRank = submitScore(gameId, { initials, score, difficulty });
    const week = getWeekKey();
    const board = getBoard(week, gameId);
    setWeekKey(week);
    setRank(newRank);
    setHighlightTs(newRank > 0 ? board[newRank - 1]?.ts : undefined);
    setPhase("board");
  }, [difficulty, gameId, score, focusSlot]);

  // Physical keyboard: A–Z types and advances, Backspace steps back, Enter = OK.
  useEffect(() => {
    if (phase !== "entry") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const slot = activeSlotRef.current;

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        setLetterAt(slot, e.key.toUpperCase());
        focusSlot(slot + 1);
        return;
      }
      switch (e.key) {
        case "Backspace":
          e.preventDefault();
          focusSlot(slot - 1);
          break;
        case "Enter":
          e.preventDefault();
          handleOk();
          break;
        case "ArrowUp":
          e.preventDefault();
          bumpSlot(slot, 1);
          break;
        case "ArrowDown":
          e.preventDefault();
          bumpSlot(slot, -1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          focusSlot(slot - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          focusSlot(slot + 1);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, focusSlot, setLetterAt, bumpSlot, handleOk]);

  if (phase === "idle") return null;

  return (
    <div
      className="lb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${gameName} high score`}
    >
      <div className="lb-panel">
        {phase === "entry" ? (
          <>
            <div className="lb-title">HIGH SCORE!</div>
            <div className="lb-subtitle">{gameName}</div>
            <div className="lb-score">{score.toLocaleString()}</div>
            <div className="lb-prompt">Enter your initials</div>

            <div className={`lb-slots ${shaking ? "lb-shake" : ""}`}>
              {letters.map((letter, i) => (
                <div
                  key={i}
                  className={`lb-slot ${i === activeSlot ? "lb-slot-active" : ""}`}
                >
                  <button
                    type="button"
                    className="lb-arrow"
                    aria-label={`Next letter, slot ${i + 1}`}
                    onClick={() => bumpSlot(i, 1)}
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    className="lb-letter"
                    aria-label={`Slot ${i + 1}, letter ${letter}`}
                    onClick={() => focusSlot(i)}
                  >
                    {letter}
                  </button>
                  <button
                    type="button"
                    className="lb-arrow"
                    aria-label={`Previous letter, slot ${i + 1}`}
                    onClick={() => bumpSlot(i, -1)}
                  >
                    &#9660;
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-large lb-ok"
              onClick={handleOk}
            >
              OK &#10003;
            </button>
          </>
        ) : (
          <>
            <div className="lb-title lb-title-rank">
              {rank > 0 ? `RANK #${rank}` : "NICE RUN!"}
            </div>
            <div className="lb-subtitle">{gameName} — this week</div>
            <LeaderboardTable
              gameId={gameId}
              weekKey={weekKey}
              highlightTs={highlightTs}
            />
            <button
              type="button"
              className="btn btn-primary btn-large lb-ok"
              onClick={() => onDoneRef.current()}
            >
              Awesome!
            </button>
          </>
        )}
      </div>
    </div>
  );
}
