import { useState } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { DifficultyPicker } from "@/components/DifficultyPicker";
import { loadAllScores, resetAllScores, type ScoreMap } from "@/lib/score-store";
import { GAMES } from "@/lib/games-catalog";

// Two pinned hero games shown as large cards at the top.
const HERO_IDS = ["survivors", "jeopardy"];

function StarDisplay({ stars }: { stars: number }) {
  return (
    <div className="game-card-stars" style={stars <= 0 ? { visibility: "hidden" } : undefined}>
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          className={
            s <= stars
              ? "game-card-star-earned"
              : "game-card-star-empty"
          }
        >
          &#9733;
        </span>
      ))}
    </div>
  );
}

export function Landing() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();
  const [scores, setScores] = useState<ScoreMap>(() => loadAllScores());

  const [isReturnVisit] = useState(() => {
    try {
      const key = "churchGamesVisited";
      const visited = sessionStorage.getItem(key);
      sessionStorage.setItem(key, "1");
      return !!visited;
    } catch {
      return false;
    }
  });

  const heroGames = GAMES.filter((g) => HERO_IDS.includes(g.id));
  const moreGames = GAMES.filter((g) => !HERO_IDS.includes(g.id));

  const hasAnyProgress = Object.keys(scores).length > 0;

  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className={isReturnVisit ? "landing-title" : "landing-title landing-title-entrance"}>
          Church Games
        </h1>
        {loading && <p className="landing-subtitle">Loading lesson...</p>}
        {error && (
          <p className="landing-subtitle landing-error">
            Could not load lesson data
          </p>
        )}
        {lesson && (
          <>
            <h2
              className={isReturnVisit ? "landing-lesson-title" : "landing-lesson-title landing-subtitle-entrance"}
              style={isReturnVisit ? undefined : { "--entrance-delay": "400ms" } as React.CSSProperties}
            >
              {lesson.meta.title}
            </h2>
            <p
              className={isReturnVisit ? "landing-verse" : "landing-verse landing-subtitle-entrance"}
              style={isReturnVisit ? undefined : { "--entrance-delay": "550ms" } as React.CSSProperties}
            >
              <span className="landing-verse-ref">
                {lesson.meta.verseReference}
              </span>
            </p>
          </>
        )}
      </header>

      <div className="landing-pickers">
        <DifficultyPicker />
        <a href="#/leaderboard" className="landing-leaderboard-link">
          <span aria-hidden="true">🏆</span> High Scores
        </a>
      </div>

      {/* Hero Section: 2 big cards */}
      <section className="hero-section">
        {heroGames.map((card, index) => {
          const record = scores[card.id];

          return (
            <div
              key={card.id}
              className={isReturnVisit ? "" : "card-entrance card-entrance-hero"}
              style={isReturnVisit ? undefined : {
                "--entrance-delay": `${300 + index * 100}ms`,
              } as React.CSSProperties}
            >
              <a
                href={`#${card.route}`}
                className="game-card game-card-active game-card-hero"
              >
                <div
                  className="game-card-color-bar"
                  style={{
                    backgroundColor: card.color,
                    boxShadow: `0 0 20px ${card.color}40`,
                  }}
                />
                <span className="game-card-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <h3 className="game-card-name">{card.name}</h3>
                <StarDisplay stars={record?.bestStars ?? 0} />
                <p className="game-card-desc">{card.description}</p>
              </a>
            </div>
          );
        })}
      </section>

      {/* More Games Section: smaller cards in a row */}
      <section className="more-games-section">
        <h3
          className={isReturnVisit ? "more-games-title" : "more-games-title more-games-title-entrance"}
          style={isReturnVisit ? undefined : { "--entrance-delay": "650ms" } as React.CSSProperties}
        >
          More Games
        </h3>
        <div className="more-games-row">
          {moreGames.map((card, index) => {
            const record = scores[card.id];
            return (
              <div
                key={card.id}
                className={isReturnVisit ? "" : "card-entrance"}
                style={isReturnVisit ? undefined : {
                  "--entrance-delay": `${700 + index * 80}ms`,
                } as React.CSSProperties}
              >
                <a
                  href={`#${card.route}`}
                  className="game-card game-card-active game-card-small"
                >
                  <div
                    className="game-card-color-bar"
                    style={{
                      backgroundColor: card.color,
                      boxShadow: `0 0 12px ${card.color}40`,
                    }}
                  />
                  <span className="game-card-icon" aria-hidden="true">
                    {card.icon}
                  </span>
                  <h3 className="game-card-name">{card.name}</h3>
                  <StarDisplay stars={record?.bestStars ?? 0} />
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {hasAnyProgress && (
        <div className="landing-reset">
          <button
            className="landing-reset-btn"
            onClick={() => {
              resetAllScores();
              setScores({});
            }}
          >
            Reset Progress
          </button>
        </div>
      )}

      <footer className="landing-footer">
        <a href="#/teacher" className="landing-teacher-link">
          Teacher
        </a>
      </footer>
    </div>
  );
}
