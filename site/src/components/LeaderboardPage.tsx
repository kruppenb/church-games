import { useMemo, useState } from "react";
import { GAMES } from "@/lib/games-catalog";
import { getBoard, getWeekKey, formatWeekLabel, listWeeks } from "@/lib/leaderboard-store";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";

const MAX_PAST_WEEKS = 5;

export default function LeaderboardPage() {
  const currentWeekKey = useMemo(() => getWeekKey(), []);

  // "This Week" always appears first, even if it has no entries yet. Past
  // weeks (newest first) come from storage, capped at MAX_PAST_WEEKS.
  const weekKeys = useMemo(() => {
    const stored = listWeeks().filter((w) => w !== currentWeekKey);
    return [currentWeekKey, ...stored.slice(0, MAX_PAST_WEEKS)];
  }, [currentWeekKey]);

  const [selectedWeek, setSelectedWeek] = useState(currentWeekKey);

  // Games with at least one entry in the selected week, in catalog order.
  const gamesWithScores = useMemo(
    () =>
      GAMES.filter((game) => getBoard(selectedWeek, game.id).length > 0),
    // selectedWeek is the only real dependency; GAMES is a stable module const.
    [selectedWeek],
  );

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
      </header>

      <div className="lbp-weeks" role="tablist" aria-label="Select week">
        {weekKeys.map((weekKey) => (
          <button
            key={weekKey}
            type="button"
            role="tab"
            aria-selected={weekKey === selectedWeek}
            className={`lbp-week-pill ${weekKey === selectedWeek ? "lbp-week-pill-active" : ""}`}
            onClick={() => setSelectedWeek(weekKey)}
          >
            {weekKey === currentWeekKey ? "This Week" : formatWeekLabel(weekKey)}
          </button>
        ))}
      </div>

      {gamesWithScores.length === 0 ? (
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
              <LeaderboardTable gameId={game.id} weekKey={selectedWeek} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
