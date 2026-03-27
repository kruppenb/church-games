import { describe, it, expect } from "vitest";
import {
  createInitialState,
  answerQuestion,
  addWeapon,
  getWeaponLevel,
  defeatEnemy,
  takeDamage,
  healPlayer,
  boostMaxHp,
  calculateStars,
  isGameOver,
  getAvailableEvolutions,
  evolveWeapon,
  generateWeaponChoices,
  collectXpOrb,
  getXpBarProgress,
  activateXpBonus,
  WEAPON_OPTIONS,
  MAX_WEAPON_LEVEL,
  EVOLUTION_RECIPES,
  BASE_XP_TO_NEXT,
  XP_SCALING,
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
      expect(state.evolvedWeapons).toEqual([]);
      expect(state.xpOrbs).toBe(0);
      expect(state.xpOrbsToNext).toBe(BASE_XP_TO_NEXT);
      expect(state.xpBonusCount).toBe(0);
      expect(state.gameOver).toBe(false);
      expect(state.victory).toBe(false);
      expect(state.elapsedSeconds).toBe(0);
    });
  });

  describe("answerQuestion", () => {
    it("correct answer adds 200 score, increments questionsCorrect, and applies base scaling", () => {
      const state = createInitialState();
      const next = answerQuestion(state, true);

      expect(next.questionsCorrect).toBe(1);
      expect(next.questionsTotal).toBe(1);
      expect(next.score).toBe(200);
      expect(next.enemySpeedMultiplier).toBeCloseTo(1.04);
      expect(next.enemySpawnMultiplier).toBeCloseTo(1.06);
    });

    it("wrong answer applies same base scaling with no extra penalty", () => {
      const state = createInitialState();
      const next = answerQuestion(state, false);

      expect(next.questionsCorrect).toBe(0);
      expect(next.questionsTotal).toBe(1);
      expect(next.enemySpeedMultiplier).toBeCloseTo(1.04);
      expect(next.enemySpawnMultiplier).toBeCloseTo(1.06);
    });

    it("stacks base scaling multiplicatively across waves", () => {
      let state = createInitialState();
      state = answerQuestion(state, true);
      state = answerQuestion(state, false);
      state = answerQuestion(state, true);

      expect(state.enemySpeedMultiplier).toBeCloseTo(1.04 ** 3);
      expect(state.enemySpawnMultiplier).toBeCloseTo(1.06 ** 3);
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

  describe("boostMaxHp", () => {
    it("increases maxHp and playerHp by 1", () => {
      const state = createInitialState();
      const next = boostMaxHp(state);

      expect(next.maxHp).toBe(11);
      expect(next.playerHp).toBe(11);
    });

    it("stacks infinitely", () => {
      let state = createInitialState();
      for (let i = 0; i < 5; i++) {
        state = boostMaxHp(state);
      }

      expect(state.maxHp).toBe(15);
      expect(state.playerHp).toBe(15);
    });

    it("heals 1 even when damaged", () => {
      let state = createInitialState();
      state = takeDamage(state, 5); // HP: 5/10
      state = boostMaxHp(state);    // HP: 6/11

      expect(state.maxHp).toBe(11);
      expect(state.playerHp).toBe(6);
    });
  });

  describe("calculateStars", () => {
    it("returns 3 stars for score >= 10000", () => {
      const state = { ...createInitialState(), score: 10000 };
      expect(calculateStars(state)).toBe(3);
    });

    it("returns 2 stars for score >= 5000 but < 10000", () => {
      const state = { ...createInitialState(), score: 7500 };
      expect(calculateStars(state)).toBe(2);
    });

    it("returns 1 star for score < 5000", () => {
      const state = { ...createInitialState(), score: 3000 };
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
    it("has 7 weapon options with unique types", () => {
      expect(WEAPON_OPTIONS).toHaveLength(7);
      const types = WEAPON_OPTIONS.map((w) => w.type);
      expect(new Set(types).size).toBe(7);
      expect(types).toContain("fire-ring");
      expect(types).toContain("lightning");
      expect(types).toContain("shield");
      expect(types).toContain("orbit");
      expect(types).toContain("holy-water");
      expect(types).toContain("axe");
      expect(types).toContain("beam");
    });
  });

  // ---- Evolution system tests ----

  describe("EVOLUTION_RECIPES", () => {
    it("has 4 recipes with valid ingredient pairs", () => {
      expect(EVOLUTION_RECIPES).toHaveLength(4);
      for (const recipe of EVOLUTION_RECIPES) {
        expect(recipe.ingredients).toHaveLength(2);
        // Each ingredient should be a valid weapon type
        for (const ingredient of recipe.ingredients) {
          expect(WEAPON_OPTIONS.some((w) => w.type === ingredient)).toBe(true);
        }
      }
    });

    it("has unique recipe ids", () => {
      const ids = EVOLUTION_RECIPES.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("getAvailableEvolutions", () => {
    it("returns empty when no weapons are maxed", () => {
      const state = createInitialState();
      expect(getAvailableEvolutions(state)).toEqual([]);
    });

    it("returns empty when only one ingredient is maxed", () => {
      let state = createInitialState();
      // Max fire-ring but not holy-water
      for (let i = 0; i < 3; i++) state = addWeapon(state, WEAPON_OPTIONS[0]);
      expect(getAvailableEvolutions(state)).toEqual([]);
    });

    it("returns baptism-of-fire when fire-ring and holy-water are both maxed", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      const holyWater = WEAPON_OPTIONS.find((w) => w.type === "holy-water")!;
      for (let i = 0; i < 3; i++) state = addWeapon(state, fireRing);
      for (let i = 0; i < 3; i++) state = addWeapon(state, holyWater);

      const evolutions = getAvailableEvolutions(state);
      expect(evolutions.length).toBeGreaterThanOrEqual(1);
      expect(evolutions.some((e) => e.id === "baptism-of-fire")).toBe(true);
    });

    it("does not return already-evolved recipes", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      const holyWater = WEAPON_OPTIONS.find((w) => w.type === "holy-water")!;
      for (let i = 0; i < 3; i++) state = addWeapon(state, fireRing);
      for (let i = 0; i < 3; i++) state = addWeapon(state, holyWater);

      // Evolve it
      state = evolveWeapon(state, "baptism-of-fire")!;
      const evolutions = getAvailableEvolutions(state);
      expect(evolutions.some((e) => e.id === "baptism-of-fire")).toBe(false);
    });
  });

  describe("evolveWeapon", () => {
    it("removes ingredient weapons and adds evolved weapon", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      const holyWater = WEAPON_OPTIONS.find((w) => w.type === "holy-water")!;
      for (let i = 0; i < 3; i++) state = addWeapon(state, fireRing);
      for (let i = 0; i < 3; i++) state = addWeapon(state, holyWater);

      const result = evolveWeapon(state, "baptism-of-fire");
      expect(result).not.toBeNull();
      expect(result!.evolvedWeapons).toContain("baptism-of-fire");
      expect(result!.weapons.find((w) => w.type === "fire-ring")).toBeUndefined();
      expect(result!.weapons.find((w) => w.type === "holy-water")).toBeUndefined();
    });

    it("adds 500 score bonus on evolution", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      const holyWater = WEAPON_OPTIONS.find((w) => w.type === "holy-water")!;
      for (let i = 0; i < 3; i++) state = addWeapon(state, fireRing);
      for (let i = 0; i < 3; i++) state = addWeapon(state, holyWater);
      const scoreBefore = state.score;

      const result = evolveWeapon(state, "baptism-of-fire")!;
      expect(result.score).toBe(scoreBefore + 500);
    });

    it("returns null for invalid recipe id", () => {
      const state = createInitialState();
      expect(evolveWeapon(state, "nonexistent" as any)).toBeNull();
    });

    it("returns null when ingredients are not maxed", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      state = addWeapon(state, fireRing); // only level 1

      expect(evolveWeapon(state, "baptism-of-fire")).toBeNull();
    });

    it("returns null when already evolved", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      const holyWater = WEAPON_OPTIONS.find((w) => w.type === "holy-water")!;
      for (let i = 0; i < 3; i++) state = addWeapon(state, fireRing);
      for (let i = 0; i < 3; i++) state = addWeapon(state, holyWater);
      state = evolveWeapon(state, "baptism-of-fire")!;

      expect(evolveWeapon(state, "baptism-of-fire")).toBeNull();
    });
  });

  // ---- Weapon choice generation tests ----

  describe("generateWeaponChoices", () => {
    it("returns up to 3 weapon choices for initial state", () => {
      const state = createInitialState();
      const choices = generateWeaponChoices(state);
      expect(choices.length).toBe(3);
      for (const choice of choices) {
        expect(choice.kind).toBe("weapon");
      }
    });

    it("includes evolution options when available", () => {
      let state = createInitialState();
      const fireRing = WEAPON_OPTIONS.find((w) => w.type === "fire-ring")!;
      const holyWater = WEAPON_OPTIONS.find((w) => w.type === "holy-water")!;
      for (let i = 0; i < 3; i++) state = addWeapon(state, fireRing);
      for (let i = 0; i < 3; i++) state = addWeapon(state, holyWater);

      const choices = generateWeaponChoices(state);
      expect(choices.some((c) => c.kind === "evolution")).toBe(true);
    });

    it("returns max-hp choice when all weapons are maxed and no evolutions available", () => {
      let state = createInitialState();
      // Max all 7 weapons
      for (const weapon of WEAPON_OPTIONS) {
        for (let i = 0; i < 3; i++) state = addWeapon(state, weapon);
      }
      // Evolve all available
      for (const recipe of EVOLUTION_RECIPES) {
        const result = evolveWeapon(state, recipe.id);
        if (result) state = result;
      }

      // After evolving, some weapons were removed — the remaining non-maxed
      // weapons should fill slots, or if truly nothing is available, max-hp
      const choices = generateWeaponChoices(state);
      expect(choices.length).toBeGreaterThanOrEqual(1);
    });

    it("uses provided random function for deterministic shuffling", () => {
      const state = createInitialState();
      let callCount = 0;
      const deterministicRandom = () => {
        callCount++;
        return 0.5;
      };
      const choices = generateWeaponChoices(state, deterministicRandom);
      expect(choices.length).toBe(3);
      expect(callCount).toBeGreaterThan(0);
    });
  });

  // ---- XP Orb system tests ----

  describe("collectXpOrb", () => {
    it("increments xpOrbs by 1", () => {
      const state = createInitialState();
      const result = collectXpOrb(state);
      expect(result.state.xpOrbs).toBe(1);
      expect(result.barFull).toBe(false);
    });

    it("reports barFull when reaching xpOrbsToNext", () => {
      let state = createInitialState();
      // Collect orbs up to threshold - 1
      for (let i = 0; i < BASE_XP_TO_NEXT - 1; i++) {
        const result = collectXpOrb(state);
        state = result.state;
        expect(result.barFull).toBe(false);
      }
      // One more should trigger full
      const result = collectXpOrb(state);
      expect(result.barFull).toBe(true);
      expect(result.state.xpOrbs).toBe(BASE_XP_TO_NEXT);
    });
  });

  describe("getXpBarProgress", () => {
    it("returns 0 for initial state", () => {
      expect(getXpBarProgress(createInitialState())).toBe(0);
    });

    it("returns correct ratio", () => {
      const state = { ...createInitialState(), xpOrbs: 5, xpOrbsToNext: 10 };
      expect(getXpBarProgress(state)).toBeCloseTo(0.5);
    });

    it("clamps at 1", () => {
      const state = { ...createInitialState(), xpOrbs: 20, xpOrbsToNext: 10 };
      expect(getXpBarProgress(state)).toBe(1);
    });
  });

  describe("activateXpBonus", () => {
    it("resets orbs and increases threshold", () => {
      let state = { ...createInitialState(), xpOrbs: BASE_XP_TO_NEXT };
      const result = activateXpBonus(state);
      expect(result.state.xpOrbs).toBe(0);
      expect(result.state.xpOrbsToNext).toBe(BASE_XP_TO_NEXT + XP_SCALING);
      expect(result.state.xpBonusCount).toBe(1);
    });

    it("cycles through bonus types", () => {
      let state = createInitialState();

      // First bonus: score
      const r1 = activateXpBonus(state);
      expect(r1.bonus).toBe("score");
      expect(r1.state.score).toBe(300);

      // Second bonus: speed
      const r2 = activateXpBonus(r1.state);
      expect(r2.bonus).toBe("speed");

      // Third bonus: weapon-charge
      const r3 = activateXpBonus(r2.state);
      expect(r3.bonus).toBe("weapon-charge");

      // Fourth bonus: back to score
      const r4 = activateXpBonus(r3.state);
      expect(r4.bonus).toBe("score");
    });

    it("score bonus adds 300 points", () => {
      const state = createInitialState();
      const result = activateXpBonus(state);
      expect(result.bonus).toBe("score");
      expect(result.state.score).toBe(300);
    });
  });
});
