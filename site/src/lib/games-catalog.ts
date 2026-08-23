/**
 * Shared catalog of the 9 mini-games: id, display name, icon, description,
 * accent color, and route. Single source of truth for Landing's game cards
 * and the leaderboard page's game ordering / display metadata.
 *
 * `id` values must match the `gameId` used by `leaderboard-store.ts` boards
 * and `HighScoreFlow`.
 */

export interface GameInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  route: string;
}

export const GAMES: GameInfo[] = [
  {
    id: "quiz-showdown",
    name: "Quiz Showdown",
    icon: "🎯",
    description: "Test your Bible knowledge with fast-paced questions!",
    color: "#ff3b5c",
    route: "/games/quiz",
  },
  {
    id: "word-scramble",
    name: "Word Scramble",
    icon: "🔤",
    description: "Unscramble key words from today's lesson!",
    color: "#00d4ff",
    route: "/games/words",
  },
  {
    id: "faith-fortress",
    name: "Faith Fortress",
    icon: "🏰",
    description: "Build towers to defend the village from waves of doubt!",
    color: "#ff2d78",
    route: "/games/fortress",
  },
  {
    id: "promised-land",
    name: "Promised Land",
    icon: "⚔️",
    description: "Lead your heroes on an epic quest through the story!",
    color: "#ffd700",
    route: "/games/rpg",
  },
  {
    id: "millionaire",
    name: "Bible Millionaire",
    icon: "🏛️",
    description: "Answer questions to build a temple - how far will you go?",
    color: "#a855f7",
    route: "/games/escape",
  },
  {
    id: "survivors",
    name: "Survivors",
    icon: "💥",
    description: "Survive waves of enemies powered by your answers!",
    color: "#00ff88",
    route: "/games/survivors",
  },
  {
    id: "jeopardy",
    name: "Jeopardy",
    icon: "📋",
    description: "Pick your category and go for the high score!",
    color: "#2d7cff",
    route: "/games/jeopardy",
  },
  {
    id: "scripture-cards",
    name: "Scripture Cards",
    icon: "🃏",
    description: "Battle with faith-powered cards in this epic card game!",
    color: "#e91e63",
    route: "/games/cards",
  },
  {
    id: "kingdom-match",
    name: "Kingdom Match",
    icon: "👑",
    description: "Match tiles to build the Kingdom!",
    color: "#9b59b6",
    route: "/games/match",
  },
];
