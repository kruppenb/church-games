import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { DifficultyPicker } from "@/components/DifficultyPicker";

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
    route: "/games/brawler",
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
];

// Quiz is always shown as hero. The spotlight picks one additional hero game.
const QUIZ_ID = "quiz-showdown";
const ROTATABLE_IDS = GAMES.filter((g) => g.id !== QUIZ_ID).map((g) => g.id);

export function Landing() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  const rawSpotlight = lesson?.meta.spotlightGame ?? "";
  const spotlightId = ROTATABLE_IDS.includes(rawSpotlight)
    ? rawSpotlight
    : ROTATABLE_IDS[0];

  // Hero cards: Quiz + featured game
  const heroGames = GAMES.filter(
    (g) => g.id === QUIZ_ID || g.id === spotlightId,
  );

  // More Games: everything else
  const moreGames = GAMES.filter(
    (g) => g.id !== QUIZ_ID && g.id !== spotlightId,
  );

  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-title">Church Games</h1>
        {loading && <p className="landing-subtitle">Loading lesson...</p>}
        {error && (
          <p className="landing-subtitle landing-error">
            Could not load lesson data
          </p>
        )}
        {lesson && (
          <>
            <h2 className="landing-lesson-title">{lesson.meta.title}</h2>
            <p className="landing-verse">
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
        {heroGames.map((card) => {
          const isSpotlight = card.id === spotlightId;

          return (
            <a
              key={card.id}
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
              <p className="game-card-desc">{card.description}</p>
            </a>
          );
        })}
      </section>

      {/* More Games Section: smaller cards in a row */}
      <section className="more-games-section">
        <h3 className="more-games-title">More Games</h3>
        <div className="more-games-row">
          {moreGames.map((card) => (
            <a
              key={card.id}
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
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
