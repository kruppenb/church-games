import { useCallback, useEffect, useRef, useState } from "react";
import { useDifficulty } from "@/hooks/useDifficulty";
import { sounds } from "@/lib/sounds";
import {
  getLastInitials,
  getWeekKey,
  isAllowedInitials,
  qualifies,
  submitScore,
  type BoardSource,
  type LeaderboardEntry,
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

/** "checking" waits on the (possibly remote) qualify check and renders nothing. */
type Phase = "idle" | "checking" | "entry" | "board";

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
  const [submitting, setSubmitting] = useState(false);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [source, setSource] = useState<BoardSource>("local");

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Every open/close bumps the run id. Async results (qualify / submit) that
  // come back for an older run are dropped: no state, no onDone.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Refs mirror state so the window keydown listener never reads stale values
  // (rapid keystrokes can arrive before React re-renders).
  const lettersRef = useRef(letters);
  lettersRef.current = letters;

  const activeSlotRef = useRef(activeSlot);

  // State updates are async — only a ref can stop a double Enter double-posting.
  const submittingRef = useRef(false);

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

  // Open / close. The qualify check can hit the network, so the flow renders
  // nothing until it answers. Non-qualifying scores close the flow from the
  // effect so the parent is never notified during render.
  useEffect(() => {
    const runId = ++runIdRef.current;

    if (!show) {
      submittingRef.current = false;
      setSubmitting(false);
      setPhase("idle");
      return;
    }

    setPhase("checking");
    void (async () => {
      const ok = await qualifies(gameId, score);
      if (!mountedRef.current || runIdRef.current !== runId) return;
      if (!ok) {
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
      setBoard([]);
      setSource("local");
      submittingRef.current = false;
      setSubmitting(false);
      setWeekKey(getWeekKey());
      setPhase("entry");
    })();
  }, [show, gameId, score, focusSlot]);

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
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    const runId = runIdRef.current;
    void (async () => {
      const result = await submitScore(gameId, { initials, score, difficulty });
      if (!mountedRef.current || runIdRef.current !== runId) {
        submittingRef.current = false;
        return;
      }
      setWeekKey(result.weekKey);
      setRank(result.rank);
      setBoard(result.board);
      setSource(result.source);
      setHighlightTs(
        result.rank > 0 ? result.board[result.rank - 1]?.ts : undefined,
      );
      submittingRef.current = false;
      setSubmitting(false);
      setPhase("board");
    })();
  }, [difficulty, gameId, score, focusSlot]);

  // Physical keyboard: A–Z types and advances, Backspace steps back, Enter = OK.
  useEffect(() => {
    if (phase !== "entry") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Mirrors the disabled buttons: nothing is editable while saving.
      if (submittingRef.current) return;

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

  if (phase === "idle" || phase === "checking") return null;

  return (
    <div
      className="lb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${gameName} high score`}
    >
      <div className="lb-panel" data-week-key={weekKey}>
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
                    disabled={submitting}
                    onClick={() => bumpSlot(i, 1)}
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    className="lb-letter"
                    aria-label={`Slot ${i + 1}, letter ${letter}`}
                    disabled={submitting}
                    onClick={() => focusSlot(i)}
                  >
                    {letter}
                  </button>
                  <button
                    type="button"
                    className="lb-arrow"
                    aria-label={`Previous letter, slot ${i + 1}`}
                    disabled={submitting}
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
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Saving…" : <>OK &#10003;</>}
            </button>
          </>
        ) : (
          <>
            <div className="lb-title lb-title-rank">
              {rank > 0 ? `RANK #${rank}` : "NICE RUN!"}
            </div>
            <div className="lb-subtitle">{gameName} — this week</div>
            <LeaderboardTable entries={board} highlightTs={highlightTs} />
            {source === "offline" ? (
              <p className="lb-offline" role="status">
                Offline — score saved on this device
              </p>
            ) : null}
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
