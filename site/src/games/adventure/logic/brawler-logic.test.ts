import { describe, it, expect } from "vitest";
import {
  createInitialState,
  answerQuestion,
  calculateStars,
  isGameComplete,
  isGameOver,
} from "./brawler-logic";

describe("brawler-logic", () => {
  describe("createInitialState", () => {
    it("sets correct defaults for 5 waves", () => {
      const state = createInitialState(5);

      expect(state.playerHp).toBe(100);
      expect(state.maxHp).toBe(100);
      expect(state.score).toBe(0);
      expect(state.streak).toBe(0);
      expect(state.bestStreak).toBe(0);
      expect(state.currentWave).toBe(0);
      expect(state.totalWaves).toBe(5);
      expect(state.wavesCleared).toEqual([false, false, false, false, false]);
      expect(state.isBossWave).toBe(false);
      expect(state.powerUpLevel).toBe(0);
    });

    it("creates the right number of waves for any count", () => {
      const state = createInitialState(8);
      expect(state.wavesCleared).toHaveLength(8);
      expect(state.wavesCleared.every((w) => w === false)).toBe(true);
    });
  });

  describe("answerQuestion", () => {
    it("correct answer adds 150 base score on first hit (streak 0)", () => {
      const state = createInitialState(5);
      const next = answerQuestion(state, true);

      expect(next.score).toBe(150); // 150 + 0*50
      expect(next.streak).toBe(1);
      expect(next.bestStreak).toBe(1);
      expect(next.wavesCleared[0]).toBe(true);
      expect(next.currentWave).toBe(1);
    });

    it("correct answer adds streak bonus on subsequent hits", () => {
      let state = createInitialState(5);
      state = answerQuestion(state, true); // score: 150, streak: 1
      state = answerQuestion(state, true); // score: 150 + (150+50) = 350, streak: 2

      expect(state.score).toBe(350);
      expect(state.streak).toBe(2);
    });

    it("score accumulates correctly across multiple correct answers", () => {
      let state = createInitialState(5);
      // Wave 0: 150 + 0*50 = 150, total = 150
      state = answerQuestion(state, true);
      // Wave 1: 150 + 1*50 = 200, total = 350
      state = answerQuestion(state, true);
      // Wave 2: 150 + 2*50 = 250, total = 600
      state = answerQuestion(state, true);

      expect(state.score).toBe(600);
      expect(state.streak).toBe(3);
      expect(state.currentWave).toBe(3);
      expect(state.wavesCleared).toEqual([true, true, true, false, false]);
    });

    it("wrong answer loses 20 HP on normal wave", () => {
      const state = createInitialState(5);
      const next = answerQuestion(state, false);

      expect(next.playerHp).toBe(80);
      expect(next.score).toBe(0);
      expect(next.streak).toBe(0);
      expect(next.currentWave).toBe(0); // does not advance
      expect(next.wavesCleared[0]).toBe(false);
    });

    it("wrong answer loses 30 HP on boss wave", () => {
      let state = createInitialState(3);
      // Clear first two waves to reach the boss (wave index 2)
      state = answerQuestion(state, true); // wave 0 cleared, now at wave 1
      state = answerQuestion(state, true); // wave 1 cleared, now at wave 2 (boss)

      expect(state.isBossWave).toBe(true);

      const afterWrong = answerQuestion(state, false);
      expect(afterWrong.playerHp).toBe(70); // 100 - 30
    });

    it("wrong answer resets streak to 0", () => {
      let state = createInitialState(5);
      state = answerQuestion(state, true); // streak: 1
      state = answerQuestion(state, true); // streak: 2
      state = answerQuestion(state, false); // streak: 0

      expect(state.streak).toBe(0);
      expect(state.bestStreak).toBe(2);
    });

    it("bestStreak tracks the highest streak achieved", () => {
      let state = createInitialState(8);
      // Build a streak of 3
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      expect(state.bestStreak).toBe(3);

      // Break it
      state = answerQuestion(state, false);
      expect(state.bestStreak).toBe(3);
      expect(state.streak).toBe(0);

      // Build again but only to 2
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      expect(state.bestStreak).toBe(3); // still 3
    });

    it("power-up level is 0 when streak < 3", () => {
      let state = createInitialState(5);
      state = answerQuestion(state, true);
      expect(state.powerUpLevel).toBe(0);
      state = answerQuestion(state, true);
      expect(state.powerUpLevel).toBe(0);
    });

    it("power-up level is 1 (fire) when streak is 3-4", () => {
      let state = createInitialState(5);
      state = answerQuestion(state, true); // streak: 1
      state = answerQuestion(state, true); // streak: 2
      state = answerQuestion(state, true); // streak: 3
      expect(state.powerUpLevel).toBe(1);

      state = answerQuestion(state, true); // streak: 4
      expect(state.powerUpLevel).toBe(1);
    });

    it("power-up level is 2 (lightning) when streak >= 5", () => {
      let state = createInitialState(8);
      for (let i = 0; i < 5; i++) {
        state = answerQuestion(state, true);
      }
      expect(state.streak).toBe(5);
      expect(state.powerUpLevel).toBe(2);
    });

    it("power-up resets to 0 on wrong answer", () => {
      let state = createInitialState(8);
      for (let i = 0; i < 3; i++) {
        state = answerQuestion(state, true);
      }
      expect(state.powerUpLevel).toBe(1);
      state = answerQuestion(state, false);
      expect(state.powerUpLevel).toBe(0);
    });

    it("does not advance past the last wave index", () => {
      let state = createInitialState(2);
      state = answerQuestion(state, true); // wave 0 → 1
      state = answerQuestion(state, true); // wave 1 → clamped to 1

      expect(state.currentWave).toBe(1);
      expect(state.wavesCleared).toEqual([true, true]);
    });

    it("HP does not go below 0", () => {
      let state = createInitialState(5);
      for (let i = 0; i < 10; i++) {
        state = answerQuestion(state, false);
      }
      expect(state.playerHp).toBe(0);
    });

    it("isBossWave is set when advancing to the last wave", () => {
      let state = createInitialState(3);
      expect(state.isBossWave).toBe(false);

      state = answerQuestion(state, true); // now at wave 1
      expect(state.isBossWave).toBe(false);

      state = answerQuestion(state, true); // now at wave 2 (last = boss)
      expect(state.isBossWave).toBe(true);
    });
  });

  describe("calculateStars", () => {
    it("returns 3 stars for bestStreak >= 5", () => {
      let state = createInitialState(8);
      for (let i = 0; i < 5; i++) {
        state = answerQuestion(state, true);
      }
      expect(calculateStars(state)).toBe(3);
    });

    it("returns 2 stars for bestStreak 3-4", () => {
      let state = createInitialState(5);
      for (let i = 0; i < 3; i++) {
        state = answerQuestion(state, true);
      }
      expect(calculateStars(state)).toBe(2);
    });

    it("returns 2 stars for bestStreak of 4", () => {
      let state = createInitialState(5);
      for (let i = 0; i < 4; i++) {
        state = answerQuestion(state, true);
      }
      expect(calculateStars(state)).toBe(2);
    });

    it("returns 1 star for bestStreak < 3", () => {
      let state = createInitialState(5);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      expect(calculateStars(state)).toBe(1);
    });

    it("returns 1 star for zero streak", () => {
      const state = createInitialState(5);
      expect(calculateStars(state)).toBe(1);
    });
  });

  describe("isGameComplete", () => {
    it("returns false when no waves are cleared", () => {
      const state = createInitialState(3);
      expect(isGameComplete(state)).toBe(false);
    });

    it("returns false when some waves are cleared", () => {
      let state = createInitialState(3);
      state = answerQuestion(state, true);
      expect(isGameComplete(state)).toBe(false);
    });

    it("returns true when all waves are cleared", () => {
      let state = createInitialState(3);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      expect(isGameComplete(state)).toBe(true);
    });
  });

  describe("isGameOver", () => {
    it("returns false when HP is above 0", () => {
      const state = createInitialState(5);
      expect(isGameOver(state)).toBe(false);
    });

    it("returns false when HP is partially depleted", () => {
      let state = createInitialState(5);
      state = answerQuestion(state, false);
      state = answerQuestion(state, false);
      expect(isGameOver(state)).toBe(false);
    });

    it("returns true when HP reaches 0", () => {
      let state = createInitialState(5);
      // 5 wrong answers = 5 * 20 = 100 damage
      for (let i = 0; i < 5; i++) {
        state = answerQuestion(state, false);
      }
      expect(state.playerHp).toBe(0);
      expect(isGameOver(state)).toBe(true);
    });
  });
});
