import { useEffect, useRef, useState } from "react";
import { GAMES } from "@/lib/games-catalog";
import {
  formatWeekLabel,
  getWeekBoards,
  getWeekKey,
  listWeeks,
  type BoardSource,
  type LeaderboardEntry,
} from "@/lib/leaderboard-store";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";

const MAX_PAST_WEEKS = 5;

export default function LeaderboardPage() {
  // The device's guess for "this week" is only a placeholder: the server owns
  // the real week key and replaces it as soon as /weeks answers.
  const [currentWeekKey, setCurrentWeekKey] = useState(() => getWeekKey());
  const [pastWeeks, setPastWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekKey());
  // null = still loading (first paint and every week switch).
  const [boards, setBoards] = useState<Record<
    string,
    LeaderboardEntry[]
  > | null>(null);
  const [source, setSource] = useState<BoardSource>("local");

  // Once a kid picks a week, a late /weeks response must not yank them back.
  const userPickedRef = useRef(false);
  // Only the newest week request may write state.
  const boardsRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listWeeks();
      if (cancelled) return;
      setCurrentWeekKey(result.currentWeekKey);
      setPastWeeks(
        result.weeks
          .filter((week) => week !== result.currentWeekKey)
          .slice(0, MAX_PAST_WEEKS),
      );
      setSource(result.source);
      if (!userPickedRef.current) setSelectedWeek(result.currentWeekKey);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requestId = ++boardsRequestRef.current;
    setBoards(null);
    void (async () => {
      const result = await getWeekBoards(selectedWeek);
      if (boardsRequestRef.current !== requestId) return;
      setBoards(result.boards);
      setSource(result.source);
    })();
  }, [selectedWeek]);

  const selectWeek = (weekKey: string) => {
    userPickedRef.current = true;
    setSelectedWeek(weekKey);
  };

  // "This Week" always appears first, even if it has no entries yet.
  const weekKeys = [currentWeekKey, ...pastWeeks];

  // Games with at least one entry in the selected week, in catalog order.
  const gamesWithScores =
    boards === null
      ? []
      : GAMES.filter((game) => (boards[game.id]?.length ?? 0) > 0);

  return (
    <div className="lbp-page">
      <header className="lbp-header">
        <a href="#/" className="btn btn-secondary lbp-back">
          &larr; Back to Games
        </a>
        <h1 className="lbp-title">
          <span aria-hidden="true">🏆</span> High Scores
        </h1>
        <p className="lbp-subtitle">{formatWeekLabel(selectedWeek)}</p>
        {source === "offline" ? (
          <p className="lbp-offline" role="status">
            Offline — showing scores saved on this device
          </p>
        ) : null}
      </header>

      <div className="lbp-weeks" role="tablist" aria-label="Select week">
        {weekKeys.map((weekKey) => (
          <button
            key={weekKey}
            type="button"
            role="tab"
            aria-selected={weekKey === selectedWeek}
            className={`lbp-week-pill ${weekKey === selectedWeek ? "lbp-week-pill-active" : ""}`}
            onClick={() => selectWeek(weekKey)}
          >
            {weekKey === currentWeekKey ? "This Week" : formatWeekLabel(weekKey)}
          </button>
        ))}
      </div>

      {boards === null ? (
        <div className="lbp-loading" role="status" aria-live="polite">
          Loading scores…
        </div>
      ) : gamesWithScores.length === 0 ? (
        <div className="lbp-empty">
          <div className="lbp-empty-icon" aria-hidden="true">
            🏆
          </div>
          <p className="lbp-empty-text">
            No high scores this week yet. Go play something!
          </p>
          <a href="#/" className="btn btn-primary btn-large">
            Play Now
          </a>
        </div>
      ) : (
        <div className="lbp-grid">
          {gamesWithScores.map((game) => (
            <div key={game.id} className="lbp-card">
              <div
                className="lbp-card-bar"
                style={{
                  backgroundColor: game.color,
                  boxShadow: `0 0 12px ${game.color}40`,
                }}
              />
              <div className="lbp-card-header">
                <span className="lbp-card-icon" aria-hidden="true">
                  {game.icon}
                </span>
                <h2 className="lbp-card-name">{game.name}</h2>
              </div>
              <LeaderboardTable entries={boards[game.id] ?? []} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
