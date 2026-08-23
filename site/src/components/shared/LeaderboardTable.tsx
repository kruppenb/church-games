import { useMemo } from "react";
import { getBoard } from "@/lib/leaderboard-store";

interface LeaderboardTableProps {
  gameId: string;
  weekKey: string;
  /** Entry with this `ts` gets the pulsing "just landed" highlight. */
  highlightTs?: number;
}

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

const DIFFICULTY_LABEL: Record<string, string> = {
  "little-kids": "Little",
  "big-kids": "Big",
};

export function LeaderboardTable({
  gameId,
  weekKey,
  highlightTs,
}: LeaderboardTableProps) {
  // highlightTs is a dep so a freshly submitted entry re-reads storage.
  const entries = useMemo(
    () => getBoard(weekKey, gameId),
    [gameId, weekKey, highlightTs],
  );

  if (entries.length === 0) {
    return <div className="lb-empty">No scores yet — be the first!</div>;
  }

  return (
    <ol className="lb-table" aria-label="High scores">
      {entries.map((entry, i) => (
        <li
          key={`${entry.ts}-${entry.initials}-${i}`}
          className={`lb-row ${entry.ts === highlightTs ? "lb-row-new" : ""}`}
        >
          <span className="lb-rank" aria-label={`Rank ${i + 1}`}>
            {i < MEDALS.length ? MEDALS[i] : i + 1}
          </span>
          <span className="lb-initials">{entry.initials}</span>
          <span className={`lb-diff lb-diff-${entry.difficulty}`}>
            <span className="lb-diff-dot" aria-hidden="true" />
            {DIFFICULTY_LABEL[entry.difficulty] ?? entry.difficulty}
          </span>
          <span className="lb-score-cell">{entry.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
