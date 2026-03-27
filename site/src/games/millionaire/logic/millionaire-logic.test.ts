import { describe, it, expect } from "vitest";
import type { Question } from "@/types/lesson";
import {
  createLadder,
  applyAnswer,
  walkAway,
  use5050,
  canUsePeek,
  useSwitchQuestion,
  usePeek,
  calculateStars,
  getTemplePiece,
  getMilestones,
  isMilestone,
  getLevelValue,
  shouldShowFinalAnswer,
  type MillionaireState,
} from "./millionaire-logic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: overrides.id ?? "q1",
    text: overrides.text ?? "What is the answer?",
    options: overrides.options ?? ["A", "B", "C", "D"],
    correctIndex: overrides.correctIndex ?? 0,
    difficulty: overrides.difficulty ?? "easy",
    hint: "hint" in overrides ? overrides.hint : "A hint",
    explanation: overrides.explanation ?? "Because it is A.",
    format: overrides.format ?? "multiple-choice",
    category: overrides.category ?? "recall",
  };
}

function makeQuestions(count: number, difficulty: "easy" | "medium" | "hard" = "easy"): Question[] {
  return Array.from({ length: count }, (_, i) =>
    makeQuestion({
      id: `q${i + 1}`,
      text: `Question ${i + 1}?`,
      difficulty,
      category: i % 3 === 0 ? "recall" : i % 3 === 1 ? "understanding" : "application",
    }),
  );
}

function makeState(overrides: Partial<MillionaireState> = {}): MillionaireState {
  const qs = makeQuestions(10);
  return {
    currentLevel: 0,
    totalLevels: 10,
    questions: qs,
    reserveQuestions: [],
    lifelines: { fiftyFifty: true, peek: true, switch: true },
    removedOptions: [],
    gameOver: false,
    walkedAway: false,
    lastMilestone: 0,
    difficulty: "little-kids",
    ...overrides,
  };
}

// =========================================================================
// createLadder
// =========================================================================

describe("createLadder", () => {
  it("returns null when fewer than 5 questions match difficulty", () => {
    const questions = makeQuestions(3, "easy");
    expect(createLadder(questions, "little-kids")).toBeNull();
  });

  it("returns null when no questions match difficulty", () => {
    const questions = makeQuestions(10, "medium");
    // little-kids only uses easy questions
    expect(createLadder(questions, "little-kids")).toBeNull();
  });

  it("creates a ladder with 10 levels for little-kids when enough questions", () => {
    const questions = makeQuestions(12, "easy");
    const state = createLadder(questions, "little-kids");
    expect(state).not.toBeNull();
    expect(state!.totalLevels).toBe(10);
    expect(state!.questions).toHaveLength(10);
    expect(state!.reserveQuestions).toHaveLength(2);
    expect(state!.currentLevel).toBe(0);
    expect(state!.difficulty).toBe("little-kids");
  });

  it("creates a ladder with 15 levels for big-kids when enough questions", () => {
    const mediumQuestions = makeQuestions(10, "medium");
    const hardQuestions = makeQuestions(8, "hard");
    const allQuestions = [...mediumQuestions, ...hardQuestions];
    const state = createLadder(allQuestions, "big-kids");
    expect(state).not.toBeNull();
    expect(state!.totalLevels).toBe(15);
    expect(state!.questions).toHaveLength(15);
    expect(state!.reserveQuestions).toHaveLength(3);
    expect(state!.difficulty).toBe("big-kids");
  });

  it("caps ladder length at available question count", () => {
    const questions = makeQuestions(7, "easy");
    const state = createLadder(questions, "little-kids");
    expect(state).not.toBeNull();
    expect(state!.totalLevels).toBe(7);
    expect(state!.questions).toHaveLength(7);
  });

  it("initializes all lifelines as available", () => {
    const questions = makeQuestions(10, "easy");
    const state = createLadder(questions, "little-kids")!;
    expect(state.lifelines.fiftyFifty).toBe(true);
    expect(state.lifelines.peek).toBe(true);
    expect(state.lifelines.switch).toBe(true);
  });

  it("sorts questions by difficulty weight then category", () => {
    const questions = [
      makeQuestion({ id: "q1", difficulty: "medium", category: "application" }),
      makeQuestion({ id: "q2", difficulty: "medium", category: "recall" }),
      makeQuestion({ id: "q3", difficulty: "hard", category: "recall" }),
      makeQuestion({ id: "q4", difficulty: "medium", category: "understanding" }),
      makeQuestion({ id: "q5", difficulty: "hard", category: "understanding" }),
    ];
    const state = createLadder(questions, "big-kids")!;
    // Medium questions should come before hard, and within same difficulty sorted by category
    expect(state.questions[0].id).toBe("q2"); // medium, recall
    expect(state.questions[1].id).toBe("q4"); // medium, understanding
    expect(state.questions[2].id).toBe("q1"); // medium, application
    expect(state.questions[3].id).toBe("q3"); // hard, recall
    expect(state.questions[4].id).toBe("q5"); // hard, understanding
  });

  it("starts with gameOver false and walkedAway false", () => {
    const questions = makeQuestions(10, "easy");
    const state = createLadder(questions, "little-kids")!;
    expect(state.gameOver).toBe(false);
    expect(state.walkedAway).toBe(false);
  });
});

// =========================================================================
// applyAnswer
// =========================================================================

describe("applyAnswer", () => {
  it("advances currentLevel on correct answer", () => {
    const state = makeState({ currentLevel: 0 });
    const result = applyAnswer(state, true);
    expect(result.currentLevel).toBe(1);
    expect(result.gameOver).toBe(false);
  });

  it("updates lastMilestone when reaching a milestone (little-kids)", () => {
    const state = makeState({ currentLevel: 2, lastMilestone: 0 });
    // Answering correctly at level 2 => level 3 = milestone
    const result = applyAnswer(state, true);
    expect(result.currentLevel).toBe(3);
    expect(result.lastMilestone).toBe(3);
  });

  it("sets gameOver when completing all levels", () => {
    const state = makeState({ currentLevel: 9, totalLevels: 10, lastMilestone: 6 });
    const result = applyAnswer(state, true);
    expect(result.currentLevel).toBe(10);
    expect(result.gameOver).toBe(true);
  });

  it("drops 1 level on wrong answer for little-kids (not below milestone)", () => {
    const state = makeState({
      currentLevel: 5,
      lastMilestone: 3,
      difficulty: "little-kids",
    });
    const result = applyAnswer(state, false);
    expect(result.currentLevel).toBe(4);
    expect(result.gameOver).toBe(false);
  });

  it("does not drop below milestone for little-kids", () => {
    const state = makeState({
      currentLevel: 3,
      lastMilestone: 3,
      difficulty: "little-kids",
    });
    const result = applyAnswer(state, false);
    expect(result.currentLevel).toBe(3);
    expect(result.gameOver).toBe(false);
  });

  it("ends game on wrong answer for big-kids, drops to milestone", () => {
    const state = makeState({
      currentLevel: 7,
      lastMilestone: 5,
      difficulty: "big-kids",
      totalLevels: 15,
    });
    const result = applyAnswer(state, false);
    expect(result.currentLevel).toBe(5);
    expect(result.gameOver).toBe(true);
  });

  it("drops to 0 for big-kids when no milestone reached yet", () => {
    const state = makeState({
      currentLevel: 3,
      lastMilestone: 0,
      difficulty: "big-kids",
      totalLevels: 15,
    });
    const result = applyAnswer(state, false);
    expect(result.currentLevel).toBe(0);
    expect(result.gameOver).toBe(true);
  });

  it("clears removedOptions on correct answer", () => {
    const state = makeState({ currentLevel: 2, removedOptions: [1, 3] });
    const result = applyAnswer(state, true);
    expect(result.removedOptions).toEqual([]);
  });

  it("does nothing if game is already over", () => {
    const state = makeState({ gameOver: true, currentLevel: 5 });
    const result = applyAnswer(state, true);
    expect(result.currentLevel).toBe(5);
    expect(result.gameOver).toBe(true);
  });

  it("updates lastMilestone correctly through multiple milestones (big-kids)", () => {
    let state = makeState({
      currentLevel: 0,
      lastMilestone: 0,
      difficulty: "big-kids",
      totalLevels: 15,
    });
    // Answer correctly through levels 0-4 to reach milestone 5
    for (let i = 0; i < 5; i++) {
      state = applyAnswer(state, true);
    }
    expect(state.currentLevel).toBe(5);
    expect(state.lastMilestone).toBe(5);

    // Answer correctly through levels 5-9 to reach milestone 10
    for (let i = 0; i < 5; i++) {
      state = applyAnswer(state, true);
    }
    expect(state.currentLevel).toBe(10);
    expect(state.lastMilestone).toBe(10);
  });
});

// =========================================================================
// walkAway
// =========================================================================

describe("walkAway", () => {
  it("sets gameOver and walkedAway to true", () => {
    const state = makeState({ currentLevel: 5 });
    const result = walkAway(state);
    expect(result.gameOver).toBe(true);
    expect(result.walkedAway).toBe(true);
    expect(result.currentLevel).toBe(5);
  });

  it("clears removedOptions", () => {
    const state = makeState({ removedOptions: [1, 2] });
    const result = walkAway(state);
    expect(result.removedOptions).toEqual([]);
  });

  it("preserves currentLevel", () => {
    const state = makeState({ currentLevel: 8 });
    const result = walkAway(state);
    expect(result.currentLevel).toBe(8);
  });
});

// =========================================================================
// use5050
// =========================================================================

describe("use5050", () => {
  const question = makeQuestion({
    options: ["A", "B", "C", "D"],
    correctIndex: 0,
  });

  it("removes exactly 2 wrong answers", () => {
    const state = makeState();
    const { state: newState, removedIndices } = use5050(state, question);
    expect(removedIndices).toHaveLength(2);
    // None of the removed should be the correct answer
    expect(removedIndices).not.toContain(0);
    // Each removed index should be valid
    for (const idx of removedIndices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
    expect(newState.lifelines.fiftyFifty).toBe(false);
  });

  it("stores removedOptions in state", () => {
    const state = makeState();
    const { state: newState, removedIndices } = use5050(state, question);
    expect(newState.removedOptions).toEqual(removedIndices);
  });

  it("does nothing if lifeline already used", () => {
    const state = makeState({
      lifelines: { fiftyFifty: false, peek: true, switch: true },
    });
    const { state: newState, removedIndices } = use5050(state, question);
    expect(removedIndices).toHaveLength(0);
    expect(newState).toBe(state);
  });

  it("never removes the correct answer", () => {
    // Run multiple times to check randomness
    const state = makeState();
    for (let trial = 0; trial < 20; trial++) {
      const { removedIndices } = use5050(
        { ...state, lifelines: { fiftyFifty: true, peek: true, switch: true } },
        question,
      );
      expect(removedIndices).not.toContain(question.correctIndex);
    }
  });
});

// =========================================================================
// canUsePeek
// =========================================================================

describe("canUsePeek", () => {
  it("returns true when question has a hint", () => {
    const q = makeQuestion({ hint: "This is a hint" });
    expect(canUsePeek(q)).toBe(true);
  });

  it("returns false when question has no hint", () => {
    const q = makeQuestion({ hint: undefined });
    expect(canUsePeek(q)).toBe(false);
  });

  it("returns false when hint is empty string", () => {
    const q = makeQuestion({ hint: "" });
    expect(canUsePeek(q)).toBe(false);
  });
});

// =========================================================================
// usePeek
// =========================================================================

describe("usePeek", () => {
  it("marks peek lifeline as used", () => {
    const state = makeState();
    const result = usePeek(state);
    expect(result.lifelines.peek).toBe(false);
    expect(result.lifelines.fiftyFifty).toBe(true);
    expect(result.lifelines.switch).toBe(true);
  });
});

// =========================================================================
// useSwitchQuestion
// =========================================================================

describe("useSwitchQuestion", () => {
  it("swaps the current question with a reserve question", () => {
    const reserve = makeQuestion({ id: "reserve-1", text: "Reserve question?" });
    const state = makeState({
      currentLevel: 2,
      reserveQuestions: [reserve],
    });
    const original = state.questions[2];
    const { state: newState, newQuestion } = useSwitchQuestion(state);

    expect(newQuestion).toEqual(reserve);
    expect(newState.questions[2]).toEqual(reserve);
    expect(newState.lifelines.switch).toBe(false);
    // Original question should be in reserves now
    expect(newState.reserveQuestions).toContain(original);
  });

  it("returns null when no reserve questions available", () => {
    const state = makeState({ reserveQuestions: [] });
    const { state: newState, newQuestion } = useSwitchQuestion(state);
    expect(newQuestion).toBeNull();
    expect(newState.lifelines.switch).toBe(true); // unchanged
  });

  it("returns null when switch lifeline already used", () => {
    const reserve = makeQuestion({ id: "r1" });
    const state = makeState({
      reserveQuestions: [reserve],
      lifelines: { fiftyFifty: true, peek: true, switch: false },
    });
    const { newQuestion } = useSwitchQuestion(state);
    expect(newQuestion).toBeNull();
  });

  it("clears removedOptions when switching (reset 50:50)", () => {
    const reserve = makeQuestion({ id: "r1" });
    const state = makeState({
      currentLevel: 0,
      reserveQuestions: [reserve],
      removedOptions: [1, 3],
    });
    const { state: newState } = useSwitchQuestion(state);
    expect(newState.removedOptions).toEqual([]);
  });
});

// =========================================================================
// calculateStars
// =========================================================================

describe("calculateStars", () => {
  it("returns 0 stars when no milestones reached (little-kids)", () => {
    const state = makeState({ currentLevel: 0 });
    expect(calculateStars(state)).toBe(0);
  });

  it("returns 1 star at milestone 3 (little-kids)", () => {
    const state = makeState({ currentLevel: 3 });
    expect(calculateStars(state)).toBe(1);
  });

  it("returns 2 stars at milestone 6 (little-kids)", () => {
    const state = makeState({ currentLevel: 6 });
    expect(calculateStars(state)).toBe(2);
  });

  it("returns 3 stars at milestone 10 (little-kids)", () => {
    const state = makeState({ currentLevel: 10 });
    expect(calculateStars(state)).toBe(3);
  });

  it("returns 1 star at milestone 5 (big-kids)", () => {
    const state = makeState({ currentLevel: 5, difficulty: "big-kids" });
    expect(calculateStars(state)).toBe(1);
  });

  it("returns 2 stars at milestone 10 (big-kids)", () => {
    const state = makeState({ currentLevel: 10, difficulty: "big-kids" });
    expect(calculateStars(state)).toBe(2);
  });

  it("returns 3 stars at milestone 15 (big-kids)", () => {
    const state = makeState({ currentLevel: 15, difficulty: "big-kids" });
    expect(calculateStars(state)).toBe(3);
  });

  it("returns correct stars for levels between milestones", () => {
    const state = makeState({ currentLevel: 4 });
    expect(calculateStars(state)).toBe(1); // past 3, not yet 6
  });
});

// =========================================================================
// getTemplePiece
// =========================================================================

describe("getTemplePiece", () => {
  it("returns correct pieces for little-kids", () => {
    expect(getTemplePiece(1, "little-kids")).toBe("Foundation Stone");
    expect(getTemplePiece(5, "little-kids")).toBe("Front Archway");
    expect(getTemplePiece(10, "little-kids")).toBe("Cross on Top");
  });

  it("returns correct pieces for big-kids", () => {
    expect(getTemplePiece(1, "big-kids")).toBe("Ground Clearing");
    expect(getTemplePiece(7, "big-kids")).toBe("Inner Pillars");
    expect(getTemplePiece(15, "big-kids")).toBe("Cross on Top");
  });

  it("returns empty string for level 0", () => {
    expect(getTemplePiece(0, "little-kids")).toBe("");
  });

  it("returns empty string for out-of-range levels", () => {
    expect(getTemplePiece(11, "little-kids")).toBe("");
    expect(getTemplePiece(16, "big-kids")).toBe("");
    expect(getTemplePiece(-1, "little-kids")).toBe("");
  });
});

// =========================================================================
// getMilestones
// =========================================================================

describe("getMilestones", () => {
  it("returns [3, 6, 10] for little-kids", () => {
    expect(getMilestones("little-kids")).toEqual([3, 6, 10]);
  });

  it("returns [5, 10, 15] for big-kids", () => {
    expect(getMilestones("big-kids")).toEqual([5, 10, 15]);
  });
});

// =========================================================================
// isMilestone
// =========================================================================

describe("isMilestone", () => {
  it("identifies little-kids milestones correctly", () => {
    expect(isMilestone(3, "little-kids")).toBe(true);
    expect(isMilestone(6, "little-kids")).toBe(true);
    expect(isMilestone(10, "little-kids")).toBe(true);
    expect(isMilestone(4, "little-kids")).toBe(false);
  });

  it("identifies big-kids milestones correctly", () => {
    expect(isMilestone(5, "big-kids")).toBe(true);
    expect(isMilestone(10, "big-kids")).toBe(true);
    expect(isMilestone(15, "big-kids")).toBe(true);
    expect(isMilestone(7, "big-kids")).toBe(false);
  });
});

// =========================================================================
// getLevelValue
// =========================================================================

describe("getLevelValue", () => {
  it("returns correct values for little-kids levels", () => {
    expect(getLevelValue(1, "little-kids")).toBe(100);
    expect(getLevelValue(4, "little-kids")).toBe(400);
    expect(getLevelValue(10, "little-kids")).toBe(1000);
  });

  it("returns correct values for big-kids levels", () => {
    expect(getLevelValue(1, "big-kids")).toBe(100);
    expect(getLevelValue(4, "big-kids")).toBe(400);
    expect(getLevelValue(10, "big-kids")).toBe(1000);
    expect(getLevelValue(15, "big-kids")).toBe(100000);
  });

  it("returns 0 for out-of-range levels", () => {
    expect(getLevelValue(0, "little-kids")).toBe(0);
    expect(getLevelValue(11, "little-kids")).toBe(0);
    expect(getLevelValue(16, "big-kids")).toBe(0);
    expect(getLevelValue(-1, "big-kids")).toBe(0);
  });
});

// =========================================================================
// shouldShowFinalAnswer
// =========================================================================

describe("shouldShowFinalAnswer", () => {
  it("returns false for little-kids regardless of level", () => {
    const state = makeState({ difficulty: "little-kids", currentLevel: 5 });
    expect(shouldShowFinalAnswer(state)).toBe(false);
  });

  it("returns false for big-kids on levels below $400 (levels 1-3)", () => {
    expect(shouldShowFinalAnswer(makeState({ difficulty: "big-kids", currentLevel: 0 }))).toBe(false);
    expect(shouldShowFinalAnswer(makeState({ difficulty: "big-kids", currentLevel: 1 }))).toBe(false);
    expect(shouldShowFinalAnswer(makeState({ difficulty: "big-kids", currentLevel: 2 }))).toBe(false);
  });

  it("returns true for big-kids at level 3 ($400 question)", () => {
    const state = makeState({ difficulty: "big-kids", currentLevel: 3, totalLevels: 15 });
    expect(shouldShowFinalAnswer(state)).toBe(true);
  });

  it("returns true for big-kids at higher levels", () => {
    expect(shouldShowFinalAnswer(makeState({ difficulty: "big-kids", currentLevel: 5, totalLevels: 15 }))).toBe(true);
    expect(shouldShowFinalAnswer(makeState({ difficulty: "big-kids", currentLevel: 10, totalLevels: 15 }))).toBe(true);
    expect(shouldShowFinalAnswer(makeState({ difficulty: "big-kids", currentLevel: 14, totalLevels: 15 }))).toBe(true);
  });
});

// =========================================================================
// Integration: full game flow
// =========================================================================

describe("full game flow", () => {
  it("little-kids can complete the game by answering all correctly", () => {
    const questions = makeQuestions(12, "easy");
    let state = createLadder(questions, "little-kids")!;

    expect(state.totalLevels).toBe(10);

    for (let i = 0; i < 10; i++) {
      expect(state.gameOver).toBe(false);
      state = applyAnswer(state, true);
    }

    expect(state.gameOver).toBe(true);
    expect(state.currentLevel).toBe(10);
    expect(calculateStars(state)).toBe(3);
  });

  it("big-kids wrong answer ends at last milestone", () => {
    const medQ = makeQuestions(15, "medium");
    let state = createLadder(medQ, "big-kids")!;

    // Answer 5 correctly (reach milestone 5)
    for (let i = 0; i < 5; i++) {
      state = applyAnswer(state, true);
    }
    expect(state.lastMilestone).toBe(5);

    // Answer wrong
    state = applyAnswer(state, false);
    expect(state.gameOver).toBe(true);
    expect(state.currentLevel).toBe(5);
    expect(calculateStars(state)).toBe(1);
  });

  it("walk away preserves progress", () => {
    const questions = makeQuestions(10, "easy");
    let state = createLadder(questions, "little-kids")!;

    // Answer 6 correctly (reach milestone 6)
    for (let i = 0; i < 6; i++) {
      state = applyAnswer(state, true);
    }

    state = walkAway(state);
    expect(state.gameOver).toBe(true);
    expect(state.walkedAway).toBe(true);
    expect(state.currentLevel).toBe(6);
    expect(calculateStars(state)).toBe(2);
  });

  it("using all lifelines in sequence", () => {
    const reserve = makeQuestion({ id: "reserve" });
    let state = makeState({ reserveQuestions: [reserve] });

    // Use 50:50
    const q = state.questions[0];
    const fiftyResult = use5050(state, q);
    state = fiftyResult.state;
    expect(state.lifelines.fiftyFifty).toBe(false);

    // Use peek
    state = usePeek(state);
    expect(state.lifelines.peek).toBe(false);

    // Use switch
    const switchResult = useSwitchQuestion(state);
    state = switchResult.state;
    expect(state.lifelines.switch).toBe(false);

    // All lifelines used
    expect(state.lifelines).toEqual({
      fiftyFifty: false,
      peek: false,
      switch: false,
    });
  });
});
