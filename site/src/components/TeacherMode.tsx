/**
 * Teacher mode — the passphrase gate plus the dashboard behind it.
 *
 * `TeacherMode` owns the unlock state machine and renders `TeacherDashboard`
 * only once the SERVER has accepted the teacher passphrase
 * (`GET /moderation/check`). The phrase is the API's `MODERATION_KEY`; it is
 * never in the URL, never in the bundle, and it is stored (session- or
 * localStorage) by `lib/teacher-session.ts`. No offline fallback by design —
 * an unreachable API shows "can't reach the server", never "wrong passphrase".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLesson } from "@/hooks/useLesson";
import { HighScoreModeration } from "@/components/HighScoreModeration";
import { GAMES } from "@/lib/games-catalog";
import {
  LeaderboardApiError,
  checkTeacherKey,
  isSharedLeaderboardConfigured,
} from "@/lib/leaderboard-api";
import {
  clearTeacherKey,
  readTeacherKey,
  saveTeacherKey,
} from "@/lib/teacher-session";

type GateState = "checking" | "locked" | "server-error" | "unlocked";

/** Why the gate is locked — `null` on a first, untried visit. */
type LockedReason = "wrong" | "throttled" | "rotated";

const MESSAGE: Record<LockedReason, string> = {
  wrong: "Wrong passphrase — try again.",
  throttled: "Too many tries — wait a few minutes and try again.",
  rotated: "The passphrase has changed — enter the new one.",
};

export function TeacherMode() {
  const configured = isSharedLeaderboardConfigured();

  const [state, setState] = useState<GateState>(() =>
    configured && readTeacherKey() !== null ? "checking" : "locked",
  );
  const [lockedReason, setLockedReason] = useState<LockedReason | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Map a failed check onto the gate. 401/429 are answers; anything else isn't. */
  const applyFailure = useCallback(
    (err: unknown, wrongReason: LockedReason) => {
      const status = err instanceof LeaderboardApiError ? err.status : undefined;
      if (status === 401) {
        clearTeacherKey();
        setLockedReason(wrongReason);
        setState("locked");
      } else if (status === 429) {
        setLockedReason("throttled");
        setState("locked");
      } else {
        // 404 (an API without the route yet), 5xx, network, timeout — we
        // cannot tell whether the phrase is right, so we must not say it isn't.
        setState("server-error");
      }
    },
    [],
  );

  /** Re-verify whatever this device already has stored (mount + Retry). */
  const verifyStored = useCallback(() => {
    const stored = readTeacherKey();
    if (stored === null) {
      setLockedReason(null);
      setState("locked");
      return;
    }
    setState("checking");
    void (async () => {
      try {
        await checkTeacherKey(stored);
        if (!mounted.current) return;
        setState("unlocked");
      } catch (err) {
        if (!mounted.current) return;
        // A stored key that comes back 401 was rotated on the server.
        applyFailure(err, "rotated");
      }
    })();
  }, [applyFailure]);

  useEffect(() => {
    mounted.current = true;
    if (configured) verifyStored();
    return () => {
      mounted.current = false;
    };
  }, [configured, verifyStored]);

  // Keep the caret where the teacher is typing: after a rejected try the input
  // is re-enabled and must take focus again (`autoFocus` only covers the mount).
  useEffect(() => {
    if (state === "locked" && !busy) inputRef.current?.focus();
  }, [state, busy, lockedReason]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;
      const key = passphrase.trim();
      if (key === "") return; // Nothing typed — no request, no scolding.

      setBusy(true);
      setLockedReason(null);
      try {
        await checkTeacherKey(key);
        if (!mounted.current) return;
        saveTeacherKey(key, remember);
        setPassphrase("");
        setState("unlocked");
      } catch (err) {
        if (!mounted.current) return;
        setPassphrase("");
        applyFailure(err, "wrong");
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [applyFailure, busy, passphrase, remember],
  );

  /** Lock button: forget the phrase on this device and show the form again. */
  const handleLock = useCallback(() => {
    clearTeacherKey();
    setPassphrase("");
    setRemember(false);
    setLockedReason(null);
    setState("locked");
  }, []);

  /** A 401 from the moderation section — the stored phrase was rotated. */
  const handleLocked = useCallback(() => {
    clearTeacherKey();
    setPassphrase("");
    setLockedReason("rotated");
    setState("locked");
  }, []);

  if (!configured) {
    return (
      <div className="teacher-gate">
        <h1 className="teacher-gate-title">Teacher Dashboard</h1>
        <p className="teacher-gate-hint">
          Teacher mode needs the shared leaderboard API — run{" "}
          <code>npm run dev:shared</code>.
        </p>
        <a href="#/" className="btn btn-secondary teacher-gate-home">
          Back to Home
        </a>
      </div>
    );
  }

  if (state === "checking") {
    return <div className="loading">Checking&hellip;</div>;
  }

  if (state === "server-error") {
    return (
      <div className="teacher-gate">
        <h1 className="teacher-gate-title">Teacher Dashboard</h1>
        <p className="teacher-gate-alert" role="alert">
          Can&apos;t reach the leaderboard server — check the connection.
        </p>
        <button
          type="button"
          className="btn btn-secondary teacher-gate-retry"
          onClick={verifyStored}
        >
          Retry
        </button>
        <a href="#/" className="teacher-gate-home">
          Back to Home
        </a>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="teacher-gate">
        <h1 className="teacher-gate-title">Teacher Dashboard</h1>
        <form
          className="teacher-gate-form"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <label className="teacher-gate-label" htmlFor="teacher-passphrase">
            Teacher passphrase
          </label>
          {/* Password managers key a saved login on a username field; this one
              is constant and visually hidden so they offer to save
              "teacher / <phrase>" instead of ignoring a lone password box. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value="teacher"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="teacher-gate-username"
          />
          <input
            id="teacher-passphrase"
            name="passphrase"
            ref={inputRef}
            className="teacher-gate-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            disabled={busy}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          {lockedReason && (
            <p className="teacher-gate-alert" role="alert">
              {MESSAGE[lockedReason]}
            </p>
          )}
          <label className="teacher-gate-remember">
            <input
              type="checkbox"
              className="teacher-gate-remember-box"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember on this device</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary teacher-gate-submit"
            disabled={busy}
          >
            Unlock
          </button>
        </form>
        <a href="#/" className="teacher-gate-home">
          Back to Home
        </a>
      </div>
    );
  }

  return <TeacherDashboard onLock={handleLock} onLocked={handleLocked} />;
}

interface TeacherDashboardProps {
  /** Lock button — forget the passphrase on this device. */
  onLock: () => void;
  /** The stored passphrase stopped working (401) — back to the gate. */
  onLocked: () => void;
}

function TeacherDashboard({ onLock, onLocked }: TeacherDashboardProps) {
  const { lesson, loading, error } = useLesson();

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  if (loading) {
    return <div className="loading">Loading lesson data...</div>;
  }

  if (error || !lesson) {
    return (
      <div className="teacher-denied">
        <h1>Error</h1>
        <p>Could not load lesson data: {error ?? "Unknown error"}</p>
        <a href="#/" className="btn btn-secondary">
          Back to Home
        </a>
      </div>
    );
  }

  return (
    <div className="teacher-dashboard">
      <header className="teacher-header">
        <h1 className="teacher-title">Teacher Dashboard</h1>
        <div className="teacher-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleFullscreen}
          >
            Presentation Mode
          </button>
          <button
            type="button"
            className="btn btn-secondary teacher-lock"
            onClick={onLock}
          >
            Lock
          </button>
        </div>
      </header>

      {/* Lesson Info */}
      <section className="teacher-section">
        <h2 className="teacher-section-title">Lesson Info</h2>
        <table className="teacher-table">
          <tbody>
            <tr>
              <th>Title</th>
              <td>{lesson.meta.title}</td>
            </tr>
            <tr>
              <th>Week</th>
              <td>{lesson.meta.week}</td>
            </tr>
            <tr>
              <th>Verse</th>
              <td>
                <strong>{lesson.meta.verseReference}</strong> &mdash;{" "}
                {lesson.meta.verseText}
              </td>
            </tr>
            <tr>
              <th>Theme</th>
              <td>{lesson.meta.theme}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* High-score moderation (shared leaderboard only) */}
      <HighScoreModeration onLocked={onLocked} />

      {/* Answer Key */}
      <section className="teacher-section">
        <h2 className="teacher-section-title">
          Answer Key ({lesson.questions.length} questions)
        </h2>
        <table className="teacher-table teacher-table-striped">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Correct Answer</th>
              <th>Difficulty</th>
            </tr>
          </thead>
          <tbody>
            {lesson.questions.map((q, i) => (
              <tr key={q.id}>
                <td>{i + 1}</td>
                <td>{q.text}</td>
                <td className="teacher-correct-answer">
                  {q.options[q.correctIndex]}
                </td>
                <td>{q.difficulty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Term Pairs */}
      {lesson.termPairs.length > 0 && (
        <section className="teacher-section">
          <h2 className="teacher-section-title">
            Term Pairs ({lesson.termPairs.length})
          </h2>
          <table className="teacher-table teacher-table-striped">
            <thead>
              <tr>
                <th>Term</th>
                <th>Definition</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {lesson.termPairs.map((tp, i) => (
                <tr key={i}>
                  <td>
                    <strong>{tp.term}</strong>
                  </td>
                  <td>{tp.definition}</td>
                  <td>{tp.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Key Words */}
      {lesson.keyWords.length > 0 && (
        <section className="teacher-section">
          <h2 className="teacher-section-title">
            Key Words ({lesson.keyWords.length})
          </h2>
          <table className="teacher-table teacher-table-striped">
            <thead>
              <tr>
                <th>Word</th>
                <th>Hint</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {lesson.keyWords.map((kw, i) => (
                <tr key={i}>
                  <td>
                    <strong>{kw.word}</strong>
                  </td>
                  <td>{kw.hint}</td>
                  <td>{kw.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Story Scenes */}
      {lesson.story.scenes.length > 0 && (
        <section className="teacher-section">
          <h2 className="teacher-section-title">Story Scenes</h2>
          {lesson.story.summary && (
            <p className="teacher-story-summary">{lesson.story.summary}</p>
          )}
          <ol className="teacher-scene-list">
            {lesson.story.scenes.map((scene, i) => (
              <li key={i} className="teacher-scene-item">
                <strong>{scene.title}</strong>
                <p>{scene.description}</p>
                {scene.questionIds.length > 0 && (
                  <span className="teacher-scene-questions">
                    Questions: {scene.questionIds.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Quick Launch */}
      <section className="teacher-section">
        <h2 className="teacher-section-title">Launch Games (Group Mode)</h2>
        <div className="teacher-game-links">
          {GAMES.map((game) => (
            <a
              key={game.id}
              href={`#${game.route}`}
              className="btn btn-primary"
            >
              {game.icon} {game.name}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
