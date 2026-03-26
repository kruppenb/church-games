import { useState } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { DifficultyPicker } from "@/components/DifficultyPicker";
import { loadAllScores, resetAllScores, type ScoreMap } from "@/lib/score-store";

interface GameCardInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  route: string;
}

const GAMES: GameCardInfo[] = [
  {
    id: "quiz-showdown",
    name: "Quiz Showdown",
    icon: "\uD83C\uDFAF",
    description: "Test your Bible knowledge with fast-paced questions!",
    color: "#ff3b5c",
    route: "/games/quiz",
  },
  {
    id: "word-scramble",
    name: "Word Scramble",
    icon: "\uD83D\uDD24",
    description: "Unscramble key words from today's lesson!",
    color: "#00d4ff",
    route: "/games/words",
  },
  {
    id: "faith-fortress",
    name: "Faith Fortress",
    icon: "\uD83C\uDFF0",
    description: "Build towers to defend the village from waves of doubt!",
    color: "#ff2d78",
    route: "/games/fortress",
  },
  {
    id: "promised-land",
    name: "Promised Land",
    icon: "\u2694\uFE0F",
    description: "Lead your heroes on an epic quest through the story!",
    color: "#ffd700",
    route: "/games/rpg",
  },
  {
    id: "millionaire",
    name: "Bible Millionaire",
    icon: "\uD83C\uDFDB\uFE0F",
    description: "Answer questions to build a temple - how far will you go?",
    color: "#a855f7",
    route: "/games/escape",
  },
  {
    id: "survivors",
    name: "Survivors",
    icon: "\uD83D\uDCA5",
    description: "Survive waves of enemies powered by your answers!",
    color: "#00ff88",
    route: "/games/survivors",
  },
  {
    id: "jeopardy",
    name: "Jeopardy",
    icon: "\uD83D\uDCCB",
    description: "Pick your category and go for the high score!",
    color: "#2d7cff",
    route: "/games/jeopardy",
  },
  {
    id: "scripture-cards",
    name: "Scripture Cards",
    icon: "\uD83C\uDCCF",
    description: "Battle with faith-powered cards in this epic card game!",
    color: "#e91e63",
    route: "/games/cards",
  },
  {
    id: "kingdom-match",
    name: "Kingdom Match",
    icon: "\uD83D\uDC51",
    description: "Match tiles to build the Kingdom!",
    color: "#9b59b6",
    route: "/games/match",
  },
];

// Quiz is always shown as hero. The spotlight picks one additional hero game.
const QUIZ_ID = "quiz-showdown";
const ROTATABLE_IDS = GAMES.filter((g) => g.id !== QUIZ_ID).map((g) => g.id);

function StarDisplay({ stars }: { stars: number }) {
  if (stars <= 0) return null;
  return (
    <div className="game-card-stars">
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

  const rawSpotlight = lesson?.meta.spotlightGame ?? "";
  const spotlightId = ROTATABLE_IDS.includes(rawSpotlight)
    ? rawSpotlight
    : ROTATABLE_IDS[0];

  const heroGames = GAMES.filter(
    (g) => g.id === QUIZ_ID || g.id === spotlightId,
  );

  const moreGames = GAMES.filter(
    (g) => g.id !== QUIZ_ID && g.id !== spotlightId,
  );

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
      </div>

      {/* Hero Section: 2 big cards */}
      <section className="hero-section">
        {heroGames.map((card, index) => {
          const isSpotlight = card.id === spotlightId;
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
                {isSpotlight && (
                  <span className="game-card-badge">This Week</span>
                )}
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
    </div>
  );
}
