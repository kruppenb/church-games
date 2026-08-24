/**
 * Teacher-only moderation for this week's shared high scores.
 *
 * Lives on the teacher dashboard (`#/teacher`), behind the passphrase gate in
 * `TeacherMode.tsx`. Lists every game that has entries this week and lets a
 * teacher remove one — Remove → inline confirm → `DELETE /entry/...`. There is
 * no key prompt here: the teacher passphrase *is* the moderation key, and it
 * is read from `lib/teacher-session.ts`.
 *
 * A 401 means the passphrase was rotated on the server: the stored copy is
 * wiped and `onLocked()` hands control back to the gate, which explains it.
 *
 * Only a `source: "shared"` board is moderatable — a device-local/offline board
 * has nothing the server knows about, so the UI says so and offers a retry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES } from "@/lib/games-catalog";
import { LeaderboardApiError, deleteEntry } from "@/lib/leaderboard-api";
import { clearTeacherKey, readTeacherKey } from "@/lib/teacher-session";
import {
  formatWeekLabel,
  getWeekBoards,
  type LeaderboardEntry,
  type WeekBoardsResult,
} from "@/lib/leaderboard-store";

export interface HighScoreModerationProps {
  /** The stored passphrase was rejected (401) — the gate takes over. */
  onLocked: () => void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  "little-kids": "Little",
  "big-kids": "Big",
};

interface Notice {
  text: string;
  ok: boolean;
}

/** `gameId::rowKey` — identifies the one row with an open confirm. */
function rowId(gameId: string, rowKey: string): string {
  return `${gameId}::${rowKey}`;
}

export function HighScoreModeration({ onLocked }: HighScoreModerationProps) {
  const [result, setResult] = useState<WeekBoardsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getWeekBoards("current");
    if (!mounted.current) return;
    setResult(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  /** Open the confirm on one row, replacing any other row's confirm. */
  const startRemove = useCallback((gameId: string, rowKey: string) => {
    setNotice(null);
    setPending(rowId(gameId, rowKey));
  }, []);

  const keepEntry = useCallback(() => {
    setNotice(null);
    setPending(null);
  }, []);

  const runDelete = useCallback(
    async (gameId: string, entry: LeaderboardEntry, key: string) => {
      const weekKey = result?.weekKey;
      const rowKey = entry.rowKey;
      if (weekKey === undefined || rowKey === undefined) return;

      setBusy(true);
      try {
        await deleteEntry(weekKey, gameId, rowKey, key);
        if (!mounted.current) return;
        setNotice({
          ok: true,
          text: `Removed ${entry.initials} · ${entry.score.toLocaleString()}.`,
        });
        setPending(null);
        await refresh();
      } catch (err) {
        if (!mounted.current) return;
        const status =
          err instanceof LeaderboardApiError ? err.status : undefined;
        if (status === 401) {
          // The passphrase was rotated on the server — forget the stored copy
          // and let the gate ask for the new one (it owns that message).
          clearTeacherKey();
          setPending(null);
          onLocked();
        } else if (status === 404) {
          // Someone else already removed it — that is the wanted end state.
          setNotice(null);
          setPending(null);
          await refresh();
        } else {
          setNotice({
            ok: false,
            text: "Couldn't remove — check the connection and try again.",
          });
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [onLocked, refresh, result?.weekKey],
  );

  const confirmRemove = useCallback(
    async (gameId: string, entry: LeaderboardEntry) => {
      setNotice(null);
      const key = readTeacherKey();
      if (key === null) {
        // Storage was cleared (or blocked) since the gate unlocked — the gate
        // has to ask again before anything is sent to the server.
        clearTeacherKey();
        onLocked();
        return;
      }
      await runDelete(gameId, entry, key);
    },
    [onLocked, runDelete],
  );

  // Error notices belong next to the row being acted on (the list can be long
  // and the phone viewport short); the success notice stays at the top since
  // its row is gone.
  const noticeNode =
    notice === null ? null : notice.ok ? (
      <p className="tm-notice tm-notice-ok" role="status">
        {notice.text}
      </p>
    ) : (
      <p className="tm-notice" role="alert">
        {notice.text}
      </p>
    );
  const noticeInRow = notice !== null && !notice.ok && pending !== null;

  function renderRow(gameId: string, entry: LeaderboardEntry, index: number) {
    const rowKey = entry.rowKey;
    const isPending = rowKey !== undefined && pending === rowId(gameId, rowKey);

    return (
      <li
        key={`${rowKey ?? "no-key"}-${entry.initials}-${index}`}
        className="tm-row"
        data-row-key={rowKey}
      >
        <span className="tm-rank">{`#${index + 1}`}</span>
        <span className="tm-initials">{entry.initials}</span>
        <span className="tm-score">{entry.score.toLocaleString()}</span>
        <span className="tm-diff">
          {DIFFICULTY_LABEL[entry.difficulty] ?? entry.difficulty}
        </span>

        <div className="tm-actions">
          {rowKey === undefined ? (
            // A board that came from the device store has no server handle,
            // so there is nothing to delete. (The real API always sends one.)
            <span className="tm-nokey">&mdash;</span>
          ) : isPending ? (
            <div className="tm-confirm" role="group" aria-label="Confirm removal">
              <span className="tm-confirm-text">
                {`Remove ${entry.initials} · ${entry.score.toLocaleString()}?`}
              </span>
              <button
                type="button"
                className="btn btn-primary tm-confirm-yes"
                disabled={busy}
                onClick={() => void confirmRemove(gameId, entry)}
              >
                Yes, remove
              </button>
              <button
                type="button"
                className="btn btn-secondary tm-confirm-keep"
                disabled={busy}
                onClick={keepEntry}
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary tm-remove"
              aria-label={`Remove ${entry.initials} ${entry.score}`}
              onClick={() => startRemove(gameId, rowKey)}
            >
              Remove
            </button>
          )}
        </div>

        {isPending && noticeInRow ? noticeNode : null}
      </li>
    );
  }

  function renderBody() {
    if (loading) {
      return (
        <p className="tm-status" role="status">
          Loading this week&apos;s boards&hellip;
        </p>
      );
    }

    if (result === null || result.source !== "shared") {
      return (
        <>
          <p className="tm-unavailable" role="status">
            Shared leaderboard unavailable &mdash; nothing to moderate.
          </p>
          <button
            type="button"
            className="btn btn-secondary tm-refresh"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </>
      );
    }

    const boards = result.boards;
    const games = GAMES.filter((game) => (boards[game.id] ?? []).length > 0);

    if (games.length === 0) {
      return <p className="tm-status">No scores this week yet.</p>;
    }

    return (
      <>
        <div className="tm-head">
          <p className="tm-week">{formatWeekLabel(result.weekKey)}</p>
          <button
            type="button"
            className="btn btn-secondary tm-refresh"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>

        {games.map((game) => (
          <div key={game.id} className="tm-game">
            <h3 className="tm-game-name">{`${game.icon} ${game.name}`}</h3>
            <ol className="tm-rows">
              {(boards[game.id] ?? []).map((entry, i) =>
                renderRow(game.id, entry, i),
              )}
            </ol>
          </div>
        ))}
      </>
    );
  }

  return (
    <section className="teacher-section tm-section">
      <h2 className="teacher-section-title">High Scores &mdash; this week</h2>
      {noticeInRow ? null : noticeNode}
      {renderBody()}
    </section>
  );
}
