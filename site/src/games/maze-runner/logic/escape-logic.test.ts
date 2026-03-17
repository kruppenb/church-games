import { describe, it, expect } from "vitest";
import {
  createInitialState,
  answerQuestion,
  tickTimer,
  isRoomCleared,
  isEscapeComplete,
  calculateStars,
  ROOM_TYPES,
  type EscapeState,
} from "./escape-logic";

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------
describe("createInitialState", () => {
  it("creates correct number of rooms", () => {
    const state = createInitialState(5, 180);
    expect(state.rooms.length).toBe(5);
    expect(state.totalRooms).toBe(5);
  });

  it("sets initial values correctly", () => {
    const state = createInitialState(4, 120);
    expect(state.currentRoom).toBe(0);
    expect(state.score).toBe(0);
    expect(state.wrongAnswers).toBe(0);
    expect(state.timeRemaining).toBe(120);
    expect(state.completed).toBe(false);
    expect(state.failed).toBe(false);
  });

  it("assigns room types in order from ROOM_TYPES", () => {
    const state = createInitialState(5, 180);
    for (let i = 0; i < 5; i++) {
      expect(state.rooms[i].roomType).toBe(ROOM_TYPES[i]);
      expect(state.rooms[i].roomIndex).toBe(i);
    }
  });

  it("wraps room types when more rooms than types", () => {
    const state = createInitialState(7, 180);
    expect(state.rooms[5].roomType).toBe(ROOM_TYPES[0]);
    expect(state.rooms[6].roomType).toBe(ROOM_TYPES[1]);
  });

  it("all rooms start uncleared with 0 answered", () => {
    const state = createInitialState(5, 180);
    for (const room of state.rooms) {
      expect(room.cleared).toBe(false);
      expect(room.questionsAnswered).toBe(0);
      expect(room.questionsNeeded).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// answerQuestion
// ---------------------------------------------------------------------------
describe("answerQuestion", () => {
  it("correct answer adds score with time bonus", () => {
    const state = createInitialState(3, 120);
    const result = answerQuestion(state, true);
    // 100 base + 120 time bonus
    expect(result.score).toBe(220);
  });

  it("correct answer clears the room (questionsNeeded = 1)", () => {
    const state = createInitialState(3, 100);
    const result = answerQuestion(state, true);
    expect(result.rooms[0].cleared).toBe(true);
    expect(result.rooms[0].questionsAnswered).toBe(1);
  });

  it("correct answer advances to next room when room is cleared", () => {
    const state = createInitialState(3, 100);
    const result = answerQuestion(state, true);
    expect(result.currentRoom).toBe(1);
  });

  it("wrong answer increments wrongAnswers", () => {
    const state = createInitialState(3, 120);
    const result = answerQuestion(state, false);
    expect(result.wrongAnswers).toBe(1);
  });

  it("wrong answer deducts 10 seconds", () => {
    const state = createInitialState(3, 120);
    const result = answerQuestion(state, false);
    expect(result.timeRemaining).toBe(110);
  });

  it("wrong answer does not go below 0 seconds", () => {
    const state = createInitialState(3, 5);
    const result = answerQuestion(state, false);
    expect(result.timeRemaining).toBe(0);
    expect(result.failed).toBe(true);
  });

  it("wrong answer with exactly 10 seconds left sets failed", () => {
    const state = createInitialState(3, 10);
    const result = answerQuestion(state, false);
    expect(result.timeRemaining).toBe(0);
    expect(result.failed).toBe(true);
  });

  it("completing all rooms sets completed = true", () => {
    let state = createInitialState(2, 180);
    state = answerQuestion(state, true); // clear room 0
    state = answerQuestion(state, true); // clear room 1
    expect(state.completed).toBe(true);
  });

  it("does not change state if already completed", () => {
    let state = createInitialState(1, 180);
    state = answerQuestion(state, true);
    expect(state.completed).toBe(true);

    const frozen = answerQuestion(state, true);
    expect(frozen).toBe(state);
  });

  it("does not change state if already failed", () => {
    let state = createInitialState(3, 5);
    state = answerQuestion(state, false); // fails (5 - 10 <= 0)
    expect(state.failed).toBe(true);

    const frozen = answerQuestion(state, true);
    expect(frozen).toBe(state);
  });

  it("accumulates score across multiple correct answers", () => {
    let state = createInitialState(3, 100);
    state = answerQuestion(state, true); // 100 + 100 = 200
    state = answerQuestion(state, true); // 100 + 100 = 200 more
    expect(state.score).toBe(400);
  });

  it("wrong answers do not affect score", () => {
    let state = createInitialState(3, 120);
    state = answerQuestion(state, false);
    state = answerQuestion(state, false);
    expect(state.score).toBe(0);
    expect(state.wrongAnswers).toBe(2);
  });

  it("does not advance currentRoom beyond last room index", () => {
    let state = createInitialState(2, 180);
    state = answerQuestion(state, true); // clear room 0, move to 1
    expect(state.currentRoom).toBe(1);
    state = answerQuestion(state, true); // clear room 1, completed
    // currentRoom stays at 1 (last valid index)
    expect(state.currentRoom).toBe(1);
    expect(state.completed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tickTimer
// ---------------------------------------------------------------------------
describe("tickTimer", () => {
  it("reduces timeRemaining by given seconds", () => {
    const state = createInitialState(3, 120);
    const result = tickTimer(state, 1);
    expect(result.timeRemaining).toBe(119);
  });

  it("sets failed when time reaches zero", () => {
    const state = createInitialState(3, 1);
    const result = tickTimer(state, 1);
    expect(result.timeRemaining).toBe(0);
    expect(result.failed).toBe(true);
  });

  it("does not go below zero", () => {
    const state = createInitialState(3, 5);
    const result = tickTimer(state, 10);
    expect(result.timeRemaining).toBe(0);
    expect(result.failed).toBe(true);
  });

  it("does not tick if already completed", () => {
    let state = createInitialState(1, 180);
    state = answerQuestion(state, true);
    expect(state.completed).toBe(true);

    const result = tickTimer(state, 10);
    expect(result).toBe(state); // same reference
  });

  it("does not tick if already failed", () => {
    let state = createInitialState(3, 1);
    state = tickTimer(state, 5);
    expect(state.failed).toBe(true);

    const result = tickTimer(state, 5);
    expect(result).toBe(state); // same reference
  });

  it("handles fractional seconds", () => {
    const state = createInitialState(3, 10);
    const result = tickTimer(state, 0.1);
    expect(result.timeRemaining).toBeCloseTo(9.9);
  });
});

// ---------------------------------------------------------------------------
// isRoomCleared
// ---------------------------------------------------------------------------
describe("isRoomCleared", () => {
  it("returns false for an uncleared room", () => {
    const state = createInitialState(3, 120);
    expect(isRoomCleared(state)).toBe(false);
  });

  it("returns true after clearing current room", () => {
    let state = createInitialState(3, 120);
    state = answerQuestion(state, true);
    // currentRoom is now 1, so check room 1 (not cleared yet)
    expect(isRoomCleared(state)).toBe(false);
    // But room 0 was cleared
    expect(state.rooms[0].cleared).toBe(true);
  });

  it("returns true when checking the last room after clearing it", () => {
    let state = createInitialState(2, 120);
    state = answerQuestion(state, true); // clear room 0
    state = answerQuestion(state, true); // clear room 1
    expect(isRoomCleared(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEscapeComplete
// ---------------------------------------------------------------------------
describe("isEscapeComplete", () => {
  it("returns false when rooms remain", () => {
    const state = createInitialState(3, 120);
    expect(isEscapeComplete(state)).toBe(false);
  });

  it("returns false when only some rooms cleared", () => {
    let state = createInitialState(3, 120);
    state = answerQuestion(state, true);
    expect(isEscapeComplete(state)).toBe(false);
  });

  it("returns true when all rooms cleared", () => {
    let state = createInitialState(3, 180);
    state = answerQuestion(state, true);
    state = answerQuestion(state, true);
    state = answerQuestion(state, true);
    expect(isEscapeComplete(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateStars
// ---------------------------------------------------------------------------
describe("calculateStars", () => {
  it("0 wrong = 3 stars", () => {
    const state = createInitialState(3, 120);
    expect(calculateStars(state)).toBe(3);
  });

  it("1 wrong = 3 stars", () => {
    let state = createInitialState(3, 120);
    state = answerQuestion(state, false);
    expect(calculateStars(state)).toBe(3);
  });

  it("2 wrong = 2 stars", () => {
    let state = createInitialState(3, 120);
    state = answerQuestion(state, false);
    state = answerQuestion(state, false);
    expect(calculateStars(state)).toBe(2);
  });

  it("3 wrong = 2 stars", () => {
    let state = createInitialState(3, 120);
    state = answerQuestion(state, false);
    state = answerQuestion(state, false);
    state = answerQuestion(state, false);
    expect(calculateStars(state)).toBe(2);
  });

  it("4 wrong = 1 star", () => {
    let state: EscapeState = { ...createInitialState(3, 300), wrongAnswers: 4 };
    expect(calculateStars(state)).toBe(1);
  });

  it("10 wrong = 1 star", () => {
    let state: EscapeState = {
      ...createInitialState(3, 300),
      wrongAnswers: 10,
    };
    expect(calculateStars(state)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: play through a full game
// ---------------------------------------------------------------------------
describe("integration: full game playthrough", () => {
  it("can complete a 5-room game with some wrong answers", () => {
    let state = createInitialState(5, 180);

    // Room 0: wrong then correct
    state = answerQuestion(state, false); // -10 sec, +1 wrong
    expect(state.timeRemaining).toBe(170);
    expect(state.currentRoom).toBe(0);
    state = answerQuestion(state, true);
    expect(state.currentRoom).toBe(1);
    expect(state.rooms[0].cleared).toBe(true);

    // Room 1: correct immediately
    state = answerQuestion(state, true);
    expect(state.currentRoom).toBe(2);

    // Room 2: two wrongs then correct
    state = answerQuestion(state, false);
    state = answerQuestion(state, false);
    state = answerQuestion(state, true);
    expect(state.currentRoom).toBe(3);
    expect(state.wrongAnswers).toBe(3);

    // Room 3: correct
    state = answerQuestion(state, true);
    expect(state.currentRoom).toBe(4);

    // Room 4: correct
    state = answerQuestion(state, true);
    expect(state.completed).toBe(true);
    expect(isEscapeComplete(state)).toBe(true);
    expect(calculateStars(state)).toBe(2); // 3 wrong answers
  });

  it("fails when time runs out from wrong answers", () => {
    let state = createInitialState(3, 30);

    state = answerQuestion(state, false); // 20 left
    state = answerQuestion(state, false); // 10 left
    state = answerQuestion(state, false); // 0 left, failed

    expect(state.failed).toBe(true);
    expect(state.completed).toBe(false);
    expect(state.timeRemaining).toBe(0);
  });

  it("fails when timer ticks to zero", () => {
    let state = createInitialState(3, 10);

    // Tick away
    for (let i = 0; i < 10; i++) {
      state = tickTimer(state, 1);
    }

    expect(state.failed).toBe(true);
    expect(state.timeRemaining).toBe(0);
  });
});
