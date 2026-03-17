import { describe, it, expect } from "vitest";
import {
  createInitialState,
  answerQuestion,
  addWeapon,
  getWeaponLevel,
  defeatEnemy,
  takeDamage,
  healPlayer,
  calculateStars,
  isGameOver,
  WEAPON_OPTIONS,
  MAX_WEAPON_LEVEL,
} from "./survivors-logic";

describe("survivors-logic", () => {
  describe("createInitialState", () => {
    it("creates correct defaults", () => {
      const state = createInitialState();

      expect(state.playerHp).toBe(10);
      expect(state.maxHp).toBe(10);
      expect(state.score).toBe(0);
      expect(state.enemiesDefeated).toBe(0);
      expect(state.questionsCorrect).toBe(0);
      expect(state.questionsTotal).toBe(0);
      expect(state.currentWave).toBe(1);
      expect(state.enemySpeedMultiplier).toBe(1);
      expect(state.enemySpawnMultiplier).toBe(1);
      expect(state.weapons).toEqual([]);
      expect(state.gameOver).toBe(false);
      expect(state.victory).toBe(false);
      expect(state.elapsedSeconds).toBe(0);
    });
  });

  describe("answerQuestion", () => {
    it("correct answer adds 200 score and increments questionsCorrect", () => {
      const state = createInitialState();
      const next = answerQuestion(state, true);

      expect(next.questionsCorrect).toBe(1);
      expect(next.questionsTotal).toBe(1);
      expect(next.score).toBe(200);
    });

    it("wrong answer doubles spawn rate and increases speed by 20%", () => {
      const state = createInitialState();
      const next = answerQuestion(state, false);

      expect(next.questionsCorrect).toBe(0);
      expect(next.questionsTotal).toBe(1);
      expect(next.enemySpeedMultiplier).toBeCloseTo(1.2);
      expect(next.enemySpawnMultiplier).toBe(2);
    });

    it("stacks wrong-answer penalties multiplicatively", () => {
      let state = createInitialState();
      state = answerQuestion(state, false);
      state = answerQuestion(state, false);

      expect(state.enemySpeedMultiplier).toBeCloseTo(1.44);
      expect(state.enemySpawnMultiplier).toBe(4);
    });
  });

  describe("addWeapon", () => {
    it("adds a new weapon at level 1", () => {
      const state = createInitialState();
      const next = addWeapon(state, WEAPON_OPTIONS[0]);

      expect(next.weapons).toHaveLength(1);
      expect(next.weapons[0].type).toBe("fire-ring");
      expect(next.weapons[0].level).toBe(1);
    });

    it("upgrades existing weapon level when added again", () => {
      let state = createInitialState();
      state = addWeapon(state, WEAPON_OPTIONS[0]); // level 1
      state = addWeapon(state, WEAPON_OPTIONS[0]); // level 2

      expect(state.weapons).toHaveLength(1);
      expect(state.weapons[0].level).toBe(2);
    });

    it("caps weapon level at MAX_WEAPON_LEVEL", () => {
      let state = createInitialState();
      state = addWeapon(state, WEAPON_OPTIONS[0]); // level 1
      state = addWeapon(state, WEAPON_OPTIONS[0]); // level 2
      state = addWeapon(state, WEAPON_OPTIONS[0]); // level 3
      state = addWeapon(state, WEAPON_OPTIONS[0]); // still 3

      expect(state.weapons[0].level).toBe(MAX_WEAPON_LEVEL);
    });

    it("tracks multiple weapon types independently", () => {
      let state = createInitialState();
      state = addWeapon(state, WEAPON_OPTIONS[0]); // fire-ring 1
      state = addWeapon(state, WEAPON_OPTIONS[1]); // lightning 1
      state = addWeapon(state, WEAPON_OPTIONS[0]); // fire-ring 2

      expect(state.weapons).toHaveLength(2);
      expect(state.weapons[0].type).toBe("fire-ring");
      expect(state.weapons[0].level).toBe(2);
      expect(state.weapons[1].type).toBe("lightning");
      expect(state.weapons[1].level).toBe(1);
    });
  });

  describe("getWeaponLevel", () => {
    it("returns 0 for weapons not owned", () => {
      const state = createInitialState();
      expect(getWeaponLevel(state, "fire-ring")).toBe(0);
    });

    it("returns the current level for owned weapons", () => {
      let state = createInitialState();
      state = addWeapon(state, WEAPON_OPTIONS[0]);
      state = addWeapon(state, WEAPON_OPTIONS[0]);

      expect(getWeaponLevel(state, "fire-ring")).toBe(2);
      expect(getWeaponLevel(state, "lightning")).toBe(0);
    });
  });

  describe("defeatEnemy", () => {
    it("increments enemiesDefeated and adds 10 to score", () => {
      const state = createInitialState();
      const next = defeatEnemy(state);

      expect(next.enemiesDefeated).toBe(1);
      expect(next.score).toBe(10);
    });

    it("accumulates across multiple defeats", () => {
      let state = createInitialState();
      for (let i = 0; i < 5; i++) {
        state = defeatEnemy(state);
      }

      expect(state.enemiesDefeated).toBe(5);
      expect(state.score).toBe(50);
    });
  });

  describe("takeDamage", () => {
    it("reduces playerHp by the given amount", () => {
      const state = createInitialState();
      const next = takeDamage(state, 3);

      expect(next.playerHp).toBe(7);
      expect(next.gameOver).toBe(false);
    });

    it("sets gameOver when HP reaches 0", () => {
      const state = createInitialState();
      const next = takeDamage(state, 10);

      expect(next.playerHp).toBe(0);
      expect(next.gameOver).toBe(true);
    });

    it("clamps HP to 0 (no negative HP)", () => {
      const state = createInitialState();
      const next = takeDamage(state, 999);

      expect(next.playerHp).toBe(0);
      expect(next.gameOver).toBe(true);
    });
  });

  describe("healPlayer", () => {
    it("heals up to maxHp", () => {
      let state = createInitialState();
      state = takeDamage(state, 5);
      state = healPlayer(state, 3);

      expect(state.playerHp).toBe(8);
    });

    it("clamps at maxHp", () => {
      let state = createInitialState();
      state = takeDamage(state, 2);
      state = healPlayer(state, 10);

      expect(state.playerHp).toBe(10);
    });
  });

  describe("calculateStars", () => {
    it("returns 3 stars for >= 80% correct and survived", () => {
      let state = createInitialState();
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, false);
      state = { ...state, victory: true };

      expect(calculateStars(state)).toBe(3);
    });

    it("returns 2 stars for >= 50% but < 80%", () => {
      let state = createInitialState();
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, true);
      state = answerQuestion(state, false);
      state = answerQuestion(state, false);
      state = { ...state, victory: true };

      expect(calculateStars(state)).toBe(2);
    });

    it("returns 1 star when player died", () => {
      let state = createInitialState();
      state = answerQuestion(state, true);
      state = takeDamage(state, 10);

      expect(calculateStars(state)).toBe(1);
    });
  });

  describe("isGameOver", () => {
    it("returns false for initial state", () => {
      expect(isGameOver(createInitialState())).toBe(false);
    });

    it("returns true when HP reaches 0", () => {
      const state = takeDamage(createInitialState(), 10);
      expect(isGameOver(state)).toBe(true);
    });

    it("returns true when victory is set", () => {
      const state = { ...createInitialState(), victory: true };
      expect(isGameOver(state)).toBe(true);
    });
  });

  describe("WEAPON_OPTIONS", () => {
    it("has 3 weapon options with unique types", () => {
      expect(WEAPON_OPTIONS).toHaveLength(3);
      const types = WEAPON_OPTIONS.map((w) => w.type);
      expect(types).toContain("fire-ring");
      expect(types).toContain("lightning");
      expect(types).toContain("shield");
    });
  });
});
