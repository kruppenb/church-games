/**
 * Pure TypeScript logic for Bible Millionaire game.
 * No React or DOM dependencies — all functions are testable in isolation.
 */

import type { Question } from "@/types/lesson";
import { filterByDifficulty } from "@/lib/difficulty";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MillionaireState {
  currentLevel: number;
  totalLevels: number;
  questions: Question[];
  reserveQuestions: Question[];
  lifelines: { fiftyFifty: boolean; peek: boolean; switch: boolean };
  removedOptions: number[];
  gameOver: boolean;
  walkedAway: boolean;
  lastMilestone: number;
  difficulty: "little-kids" | "big-kids";
}

// ---------------------------------------------------------------------------
// Temple pieces
// ---------------------------------------------------------------------------

const LITTLE_KIDS_PIECES = [
  "Foundation Stone",
  "Left Wall",
  "Right Wall",
  "Back Wall",
  "Front Archway",
  "Roof Beams",
  "Roof Tiles",
  "Door",
  "Windows",
  "Cross on Top",
];

const BIG_KIDS_PIECES = [
  "Ground Clearing",
  "Foundation Stone",
  "Left Wall",
  "Right Wall",
  "Back Wall",
  "Front Archway",
  "Inner Pillars",
  "Roof Beams",
  "Roof Tiles",
  "Steeple Base",
  "Door",
  "Windows",
  "Bell",
  "Decorations",
  "Cross on Top",
];

// ---------------------------------------------------------------------------
// Milestones (1-indexed level numbers)
// ---------------------------------------------------------------------------

const LITTLE_KIDS_MILESTONES = [3, 6, 10];
const BIG_KIDS_MILESTONES = [5, 10, 15];

export function getMilestones(
  difficulty: "little-kids" | "big-kids",
): number[] {
  return difficulty === "little-kids"
    ? LITTLE_KIDS_MILESTONES
    : BIG_KIDS_MILESTONES;
}

// ---------------------------------------------------------------------------
// Temple piece name for a given level
// ---------------------------------------------------------------------------

export function getTemplePiece(
  level: number,
  difficulty: "little-kids" | "big-kids",
): string {
  const pieces =
    difficulty === "little-kids" ? LITTLE_KIDS_PIECES : BIG_KIDS_PIECES;
  if (level < 1 || level > pieces.length) return "";
  return pieces[level - 1];
}

// ---------------------------------------------------------------------------
// Category sort order (for perceived difficulty ramp within same difficulty)
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: Record<string, number> = {
  recall: 0,
  understanding: 1,
  application: 2,
};

// ---------------------------------------------------------------------------
// Create the question ladder
// ---------------------------------------------------------------------------

export function createLadder(
  allQuestions: Question[],
  difficulty: "little-kids" | "big-kids",
): MillionaireState | null {
  const filtered = filterByDifficulty(allQuestions, difficulty);

  const targetLength = difficulty === "little-kids" ? 10 : 15;
  const ladderLength = Math.min(filtered.length, targetLength);

  if (ladderLength < 5) {
    return null; // not enough questions
  }

  // Sort by difficulty weight then by category for a perceived ramp
  const diffWeight: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

  const sorted = [...filtered].sort((a, b) => {
    const dw = diffWeight[a.difficulty] - diffWeight[b.difficulty];
    if (dw !== 0) return dw;
    return (CATEGORY_ORDER[a.category] ?? 0) - (CATEGORY_ORDER[b.category] ?? 0);
  });

  const questions = sorted.slice(0, ladderLength);
  const reserveQuestions = sorted.slice(ladderLength);

  return {
    currentLevel: 0,
    totalLevels: ladderLength,
    questions,
    reserveQuestions,
    lifelines: { fiftyFifty: true, peek: true, switch: true },
    removedOptions: [],
    gameOver: false,
    walkedAway: false,
    lastMilestone: 0,
    difficulty,
  };
}

// ---------------------------------------------------------------------------
// Apply an answer result
// ---------------------------------------------------------------------------

export function applyAnswer(
  state: MillionaireState,
  correct: boolean,
): MillionaireState {
  if (state.gameOver) return state;

  const newState = { ...state, removedOptions: [] };

  if (correct) {
    newState.currentLevel = state.currentLevel + 1;

    // Update lastMilestone if we've reached one
    const milestones = getMilestones(state.difficulty);
    for (const m of milestones) {
      if (newState.currentLevel >= m) {
        newState.lastMilestone = m;
      }
    }

    // Check if we've completed all levels
    if (newState.currentLevel >= state.totalLevels) {
      newState.gameOver = true;
    }
  } else {
    // Wrong answer
    if (state.difficulty === "little-kids") {
      // Drop 1 level, but not below last milestone
      const milestones = getMilestones(state.difficulty);
      const lastMilestone = state.lastMilestone;
      const dropped = Math.max(state.currentLevel - 1, lastMilestone);
      newState.currentLevel = dropped;
      // Don't end the game for little kids — they can keep trying
      // But we mark the question as "used" by advancing past it
      // The component handles moving to the next question
    } else {
      // Big kids: game ends at last milestone
      newState.currentLevel = state.lastMilestone;
      newState.gameOver = true;
    }
  }

  return newState;
}

// ---------------------------------------------------------------------------
// Walk away
// ---------------------------------------------------------------------------

export function walkAway(state: MillionaireState): MillionaireState {
  return {
    ...state,
    gameOver: true,
    walkedAway: true,
    removedOptions: [],
  };
}

// ---------------------------------------------------------------------------
// 50:50 lifeline
// ---------------------------------------------------------------------------

export function use5050(
  state: MillionaireState,
  question: Question,
): { state: MillionaireState; removedIndices: number[] } {
  if (!state.lifelines.fiftyFifty) {
    return { state, removedIndices: [] };
  }

  // Find indices of wrong answers
  const wrongIndices = question.options
    .map((_, i) => i)
    .filter((i) => i !== question.correctIndex);

  // Shuffle wrong indices and pick 2 to remove
  const shuffled = [...wrongIndices].sort(() => Math.random() - 0.5);
  const removedIndices = shuffled.slice(0, 2);

  return {
    state: {
      ...state,
      lifelines: { ...state.lifelines, fiftyFifty: false },
      removedOptions: removedIndices,
    },
    removedIndices,
  };
}

// ---------------------------------------------------------------------------
// Peek at Scroll lifeline (check if hint is available)
// ---------------------------------------------------------------------------

export function canUsePeek(question: Question): boolean {
  return !!question.hint;
}

// ---------------------------------------------------------------------------
// Switch Question lifeline
// ---------------------------------------------------------------------------

export function useSwitchQuestion(
  state: MillionaireState,
): { state: MillionaireState; newQuestion: Question | null } {
  if (!state.lifelines.switch || state.reserveQuestions.length === 0) {
    return { state, newQuestion: null };
  }

  const [newQuestion, ...remainingReserve] = state.reserveQuestions;
  // Put the current question into the reserve pool
  const currentQuestion = state.questions[state.currentLevel];
  const newQuestions = [...state.questions];
  newQuestions[state.currentLevel] = newQuestion;

  return {
    state: {
      ...state,
      questions: newQuestions,
      reserveQuestions: [...remainingReserve, currentQuestion],
      lifelines: { ...state.lifelines, switch: false },
      removedOptions: [], // reset 50:50 display for new question
    },
    newQuestion,
  };
}

// ---------------------------------------------------------------------------
// Mark peek lifeline as used
// ---------------------------------------------------------------------------

export function usePeek(state: MillionaireState): MillionaireState {
  return {
    ...state,
    lifelines: { ...state.lifelines, peek: false },
  };
}

// ---------------------------------------------------------------------------
// Calculate stars based on current level and milestones
// ---------------------------------------------------------------------------

export function calculateStars(state: MillionaireState): number {
  const milestones = getMilestones(state.difficulty);
  let stars = 0;
  for (const m of milestones) {
    if (state.currentLevel >= m) {
      stars++;
    }
  }
  return stars;
}

// ---------------------------------------------------------------------------
// Check if a given level is a milestone
// ---------------------------------------------------------------------------

export function isMilestone(
  level: number,
  difficulty: "little-kids" | "big-kids",
): boolean {
  return getMilestones(difficulty).includes(level);
}

// ---------------------------------------------------------------------------
// Dollar values for each level (Millionaire-style prize ladder)
// ---------------------------------------------------------------------------

const LITTLE_KIDS_VALUES = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
];

const BIG_KIDS_VALUES = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
  2000, 5000, 10000, 50000, 100000,
];

export function getLevelValue(
  level: number,
  difficulty: "little-kids" | "big-kids",
): number {
  const values =
    difficulty === "little-kids" ? LITTLE_KIDS_VALUES : BIG_KIDS_VALUES;
  if (level < 1 || level > values.length) return 0;
  return values[level - 1];
}

// ---------------------------------------------------------------------------
// Should show "Final Answer?" confirmation
// Only for big-kids difficulty on questions worth $400+
// (level index is 0-based, so currentLevel 3 = answering for level 4 = $400)
// ---------------------------------------------------------------------------

export function shouldShowFinalAnswer(state: MillionaireState): boolean {
  if (state.difficulty !== "big-kids") return false;
  // currentLevel is 0-based (the level they're answering FOR)
  // level 1=$100, level 2=$200, level 3=$300, level 4=$400
  // currentLevel 3 means answering question #4 which earns $400
  const targetLevel = state.currentLevel + 1;
  const value = getLevelValue(targetLevel, state.difficulty);
  return value >= 400;
}
